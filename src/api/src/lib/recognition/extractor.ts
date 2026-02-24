/**
 * Face Extractor — Modal/Python HTTP Client
 *
 * Calls the self-hosted InsightFace /extract endpoint.
 * Stateless: image in → embeddings out.
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
// Factory
// =============================================================================

export interface ExtractorConfig {
  endpoint: string;
}

/**
 * Create a face extractor that calls the Python /extract endpoint.
 */
export function createExtractor(config: ExtractorConfig): FaceExtractor {
  const endpoint = config.endpoint;

  const extractFaces = (imageData: ArrayBuffer): ResultAsync<ExtractionResult, RecognitionError> =>
    safeTry(async function* () {
      const base64Image = arrayBufferToBase64(imageData);

      const response = yield* ResultAsync.fromPromise(
        fetch(`${endpoint}/extract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: base64Image,
            max_faces: 100,
            min_confidence: 0.5,
          }),
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
        response.json() as Promise<{
          faces: Array<{
            embedding: number[];
            bounding_box: { x: number; y: number; width: number; height: number };
            confidence: number;
          }>;
          image_width: number;
          image_height: number;
          model: string;
          inference_ms: number;
        }>,
        (cause): RecognitionError => ({
          type: 'extraction_failed',
          retryable: true,
          throttle: false,
          cause,
        }),
      ).safeUnwrap();

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

      return ok<ExtractionResult, RecognitionError>({
        faces,
        imageWidth: data.image_width,
        imageHeight: data.image_height,
        inferenceMs: data.inference_ms,
      });
    });

  return { extractFaces };
}
