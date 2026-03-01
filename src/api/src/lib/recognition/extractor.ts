/**
 * Face Extractor — Modal/Python HTTP Client
 *
 * Calls the self-hosted InsightFace /extract endpoint.
 * Stateless: image in → embeddings out.
 *
 * Two input modes:
 * - extractFaces(ArrayBuffer)  → base64 payload (selfie search)
 * - extractFacesFromUrl(string) → image_url payload (photo indexing)
 */

import { ResultAsync, err, ok, safeTry } from 'neverthrow';
import type {
  FaceExtractor,
  ExtractionResult,
  DetectedFace,
  RecognitionError,
} from './types';

// =============================================================================
// Error Helpers
// =============================================================================

function networkError(cause: unknown): RecognitionError {
  return { type: 'extraction_failed', retryable: true, throttle: false, cause };
}

function httpError(status: number, body: { error?: string }): RecognitionError {
  // 400: Structured errors from our service
  if (status === 400) {
    const errorCode = body.error;
    if (errorCode === 'no_face_detected') {
      return { type: 'no_face_detected', retryable: false, throttle: false };
    }
    if (errorCode === 'invalid_image') {
      return { type: 'invalid_image', retryable: false, throttle: false, reason: 'invalid_image' };
    }
    if (errorCode === 'image_too_large') {
      return { type: 'invalid_image', retryable: false, throttle: false, reason: 'image_too_large' };
    }
    // Unknown 400 error
    return { type: 'invalid_image', retryable: false, throttle: false, reason: errorCode ?? 'unknown' };
  }

  // 429: Rate limited
  if (status === 429) {
    return { type: 'extraction_failed', retryable: true, throttle: true, cause: body };
  }

  // 5xx: Server errors (retryable)
  if (status >= 500) {
    return { type: 'extraction_failed', retryable: true, throttle: false, cause: body };
  }

  // Other 4xx: Client errors (not retryable)
  return { type: 'extraction_failed', retryable: false, throttle: false, cause: body };
}

// =============================================================================
// Encoding
// =============================================================================

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

// =============================================================================
// Response Type
// =============================================================================

interface ExtractResponse {
  faces: Array<{
    embedding: number[];
    bounding_box: { x: number; y: number; width: number; height: number };
    confidence: number;
  }>;
  image_width: number;
  image_height: number;
  model: string;
  inference_ms: number;
}

function parseExtractionResponse(data: ExtractResponse): ExtractionResult {
  const faces: DetectedFace[] = data.faces.map((f) => ({
    embedding: f.embedding,
    boundingBox: {
      x: f.bounding_box.x,
      y: f.bounding_box.y,
      width: f.bounding_box.width,
      height: f.bounding_box.height,
    },
    confidence: f.confidence,
  }));

  return {
    faces,
    imageWidth: data.image_width,
    imageHeight: data.image_height,
    inferenceMs: data.inference_ms,
  };
}

// =============================================================================
// Factory
// =============================================================================

export interface ExtractorConfig {
  endpoint: string;
  modalKey: string;
  modalSecret: string;
}

/**
 * Create a face extractor that calls the Python /extract endpoint.
 */
export function createExtractor(config: ExtractorConfig): FaceExtractor {
  const { endpoint, modalKey, modalSecret } = config;

  /**
   * Shared fetch + parse logic for both input modes.
   */
  const callExtract = (body: Record<string, unknown>): ResultAsync<ExtractionResult, RecognitionError> =>
    safeTry(async function* () {
      const response = yield* ResultAsync.fromPromise(
        fetch(`${endpoint}/extract`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Modal-Key': modalKey,
            'Modal-Secret': modalSecret,
          },
          body: JSON.stringify(body),
        }),
        networkError,
      ).safeUnwrap();

      if (!response.ok) {
        let errorBody: { error?: string } = {};
        try {
          errorBody = await response.json();
        } catch {
          // Use empty error if JSON parsing fails
        }
        return err(httpError(response.status, errorBody));
      }

      const data = yield* ResultAsync.fromPromise(
        response.json() as Promise<ExtractResponse>,
        (cause): RecognitionError => ({
          type: 'extraction_failed',
          retryable: true,
          throttle: false,
          cause,
        }),
      ).safeUnwrap();

      return ok(parseExtractionResponse(data));
    });

  const extractFaces = (imageData: ArrayBuffer): ResultAsync<ExtractionResult, RecognitionError> =>
    callExtract({
      image: arrayBufferToBase64(imageData),
      max_faces: 100,
      min_confidence: 0.5,
    });

  const extractFacesFromUrl = (imageUrl: string): ResultAsync<ExtractionResult, RecognitionError> =>
    callExtract({
      image_url: imageUrl,
      max_faces: 100,
      min_confidence: 0.5,
    });

  return { extractFaces, extractFacesFromUrl };
}
