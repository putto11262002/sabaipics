/**
 * SabaiFace HTTP Client
 *
 * Makes HTTP requests to SabaiFace VPS service.
 * Uses fetch() for Cloudflare Workers compatibility.
 * Uses base64 encoding for binary image data (compatible with JSON).
 *
 * Key design principles:
 * - Safe wrappers using ResultAsync.fromPromise
 * - No retry logic (consumer handles retry)
 * - Error type includes retryable and throttle flags
 * - Normalizes confidence scores to 0-1 scale
 */

import { ResultAsync, err, ok } from 'neverthrow';
import type {
  IndexPhotoRequest,
  FindSimilarRequest,
  PhotoIndexed,
  SimilarFace,
  Face,
  UnindexedFace,
  BoundingBox,
  FaceAttributes,
  FaceServiceError,
  HTTPErrorResponse,
} from './types';

// =============================================================================
// Error Types
// =============================================================================

/**
 * HTTP errors that are retryable (transient failures).
 */
const RETRYABLE_HTTP_STATUSES = new Set([
  408, // Request Timeout
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

/**
 * HTTP errors that are throttling (rate limit exceeded).
 */
const THROTTLE_HTTP_STATUSES = new Set([
  429, // Too Many Requests
]);

/**
 * Convert fetch error to FaceServiceError.
 * Extracts retryable and throttle flags from HTTP status.
 */
function httpErrorToFaceServiceError(status: number, body: HTTPErrorResponse): FaceServiceError {
  return {
    type: 'provider_failed',
    provider: 'sabaiface',
    retryable: RETRYABLE_HTTP_STATUSES.has(status) || (body.retryable ?? false),
    throttle: THROTTLE_HTTP_STATUSES.has(status) || (body.throttle ?? false),
    cause: body,
  };
}

/**
 * Convert network error to FaceServiceError.
 * Network errors are generally retryable.
 */
function networkErrorToFaceServiceError(e: unknown): FaceServiceError {
  return {
    type: 'provider_failed',
    provider: 'sabaiface',
    retryable: true,
    throttle: false,
    cause: e,
  };
}

// =============================================================================
// SabaiFace HTTP Client
// =============================================================================

export interface SabaiFaceClientConfig {
  endpoint: string;
}

/**
 * SabaiFace HTTP Client
 *
 * Makes HTTP requests to SabaiFace VPS service.
 * Uses fetch() for Cloudflare Workers compatibility.
 * Returns ResultAsync for consistent error handling.
 */
export class SabaiFaceHTTPClient {
  constructor(private config: SabaiFaceClientConfig) {}

  /**
   * Index faces from a photo.
   * POST /collections/:eventId/index-faces
   *
   * Uses ResultAsync.fromPromise for safe error handling.
   * No retry logic - consumer checks error.retryable.
   */
  indexPhoto(request: IndexPhotoRequest): ResultAsync<PhotoIndexed, FaceServiceError> {
    const url = `${this.config.endpoint}/collections/${request.eventId}/index-faces`;

    // Encode image data as base64 (match AWS API format)
    const base64Image = this.arrayBufferToBase64(request.imageData);

    return ResultAsync.fromPromise(
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Image: { Bytes: base64Image },
          ExternalImageId: request.photoId,
          DetectionAttributes: ['ALL'],
          MaxFaces: request.options?.maxFaces ?? 100,
          QualityFilter: request.options?.qualityFilter?.toUpperCase() ?? 'AUTO',
        }),
      }),
      networkErrorToFaceServiceError
    ).andThen((response) => this.handleResponse(response, (data) => this.transformIndexResponse(data)));
  }

  /**
   * Find similar faces.
   * POST /collections/:eventId/search-faces-by-image
   *
   * Uses ResultAsync.fromPromise for safe error handling.
   */
  findSimilarFaces(request: FindSimilarRequest): ResultAsync<SimilarFace[], FaceServiceError> {
    const url = `${this.config.endpoint}/collections/${request.eventId}/search-faces-by-image`;

    const base64Image = this.arrayBufferToBase64(request.imageData);

    return ResultAsync.fromPromise(
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Image: { Bytes: base64Image },
          MaxFaces: request.maxResults ?? 10,
          FaceMatchThreshold: (request.minSimilarity ?? 0.8) * 100, // 0-1 → 0-100
        }),
      }),
      networkErrorToFaceServiceError
    ).andThen((response) => this.handleResponse(response, (data) => this.transformSearchResponse(data)));
  }

  /**
   * Delete faces.
   * DELETE /collections/:eventId/faces?faceId=xxx&faceId=yyy
   *
   * Uses ResultAsync.fromPromise for safe error handling.
   */
  deleteFaces(eventId: string, faceIds: string[]): ResultAsync<void, FaceServiceError> {
    const params = new URLSearchParams();
    faceIds.forEach((id) => params.append('faceId', id));

    return ResultAsync.fromPromise(
      fetch(
        `${this.config.endpoint}/collections/${eventId}/faces?${params}`,
        { method: 'DELETE' }
      ),
      networkErrorToFaceServiceError
    ).andThen((response) => this.handleResponse(response, () => undefined));
  }

  /**
   * Delete collection.
   * DELETE /collections/:eventId
   *
   * Uses ResultAsync.fromPromise for safe error handling.
   */
  deleteCollection(eventId: string): ResultAsync<void, FaceServiceError> {
    return ResultAsync.fromPromise(
      fetch(`${this.config.endpoint}/collections/${eventId}`, { method: 'DELETE' }),
      networkErrorToFaceServiceError
    ).andThen((response) => this.handleResponse(response, () => undefined));
  }

  /**
   * Create collection.
   * POST /collections
   *
   * Uses ResultAsync.fromPromise for safe error handling.
   */
  createCollection(eventId: string): ResultAsync<string, FaceServiceError> {
    return ResultAsync.fromPromise(
      fetch(`${this.config.endpoint}/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ CollectionId: eventId }),
      }),
      networkErrorToFaceServiceError
    ).andThen((response) =>
      this.handleResponse(response, (data) => data.CollectionArn || eventId)
    );
  }

  // =============================================================================
  // HTTP Response Handling
  // =============================================================================

  /**
   * Handle HTTP response with proper error handling.
   * Returns ResultAsync with typed error on failure.
   */
  private handleResponse<T>(
    response: Response,
    transform: (data: any) => T
  ): ResultAsync<T, FaceServiceError> {
    return ResultAsync.fromPromise(
      (async () => {
        if (!response.ok) {
          // Parse error body
          let errorBody: HTTPErrorResponse = { message: response.statusText };
          try {
            errorBody = await response.json();
          } catch {
            // Use default error if JSON parsing fails
          }

          throw httpErrorToFaceServiceError(response.status, errorBody);
        }

        // Parse successful response
        const data = await response.json();
        return transform(data);
      })(),
      (e) => e as FaceServiceError
    );
  }

  // =============================================================================
  // Transformation Helpers
  // =============================================================================

  /**
   * Transform AWS-compatible IndexFaces response to domain PhotoIndexed model.
   * Normalizes confidence scores from 0-100 to 0-1.
   */
  private transformIndexResponse(data: any): PhotoIndexed {
    return {
      faces: data.FaceRecords?.map((r: any) => this.transformFaceRecord(r)) || [],
      unindexedFaces: data.UnindexedFaces?.map((f: any) => this.transformUnindexedFace(f)) || [],
      modelVersion: data.FaceModelVersion,
      provider: 'sabaiface',
    };
  }

  /**
   * Transform AWS-compatible FaceRecord to domain Face model.
   */
  private transformFaceRecord(record: any): Face {
    const face = record.Face;

    return {
      faceId: face?.FaceId || '',
      boundingBox: this.normalizeBoundingBox(face?.BoundingBox),
      confidence: this.normalizeConfidence(face?.Confidence),
      externalImageId: face?.ExternalImageId,
      attributes: this.extractAttributes(record.FaceDetail),
      provider: 'sabaiface',
    };
  }

  /**
   * Transform AWS-compatible UnindexedFace to domain UnindexedFace model.
   */
  private transformUnindexedFace(face: any): UnindexedFace {
    return {
      faceDetail: face.FaceDetail
        ? {
            boundingBox: this.normalizeBoundingBox(face.FaceDetail.BoundingBox),
            confidence: this.normalizeConfidence(face.FaceDetail.Confidence),
          }
        : undefined,
      reasons: face.Reasons?.map((r: string | bigint) => String(r)) || [],
    };
  }

  /**
   * Transform AWS-compatible SearchFacesByImage response to domain SimilarFace[] model.
   */
  private transformSearchResponse(data: any): SimilarFace[] {
    return data.FaceMatches?.map((m: any) => ({
      faceId: m.Face?.FaceId || '',
      similarity: this.normalizeConfidence(m.Similarity),
      boundingBox: m.Face?.BoundingBox ? this.normalizeBoundingBox(m.Face.BoundingBox) : undefined,
      confidence: this.normalizeConfidence(m.Face?.Confidence),
      externalImageId: m.Face?.ExternalImageId,
      provider: 'sabaiface',
    })) || [];
  }

  /**
   * Normalize AWS-compatible BoundingBox to domain BoundingBox (all fields 0-1).
   */
  private normalizeBoundingBox(box?: { Width?: number; Height?: number; Left?: number; Top?: number }): BoundingBox {
    return {
      width: box?.Width ?? 0,
      height: box?.Height ?? 0,
      left: box?.Left ?? 0,
      top: box?.Top ?? 0,
    };
  }

  /**
   * Normalize confidence (0-100) to domain confidence (0-1).
   */
  private normalizeConfidence(confidence?: number): number {
    if (confidence === undefined) return 0;
    return confidence / 100;
  }

  /**
   * Extract face attributes from AWS-compatible FaceDetail.
   */
  private extractAttributes(detail?: any): FaceAttributes | undefined {
    if (!detail) return undefined;

    return {
      age: detail.AgeRange
        ? {
            low: detail.AgeRange.Low,
            high: detail.AgeRange.High,
          }
        : undefined,
      gender: detail.Gender
        ? {
            value: detail.Gender.Value ?? '',
            confidence: this.normalizeConfidence(detail.Gender.Confidence),
          }
        : undefined,
      emotions: detail.Emotions?.map((e: any) => ({
        type: e.Type ?? '',
        confidence: this.normalizeConfidence(e.Confidence),
      })),
      smile: detail.Smile
        ? {
            value: detail.Smile.Value ?? false,
            confidence: this.normalizeConfidence(detail.Smile.Confidence),
          }
        : undefined,
      eyeglasses: detail.Eyeglasses
        ? {
            value: detail.Eyeglasses.Value ?? false,
            confidence: this.normalizeConfidence(detail.Eyeglasses.Confidence),
          }
        : undefined,
      sunglasses: detail.Sunglasses
        ? {
            value: detail.Sunglasses.Value ?? false,
            confidence: this.normalizeConfidence(detail.Sunglasses.Confidence),
          }
        : undefined,
      beard: detail.Beard
        ? {
            value: detail.Beard.Value ?? false,
            confidence: this.normalizeConfidence(detail.Beard.Confidence),
          }
        : undefined,
      mustache: detail.Mustache
        ? {
            value: detail.Mustache.Value ?? false,
            confidence: this.normalizeConfidence(detail.Mustache.Confidence),
          }
        : undefined,
      eyesOpen: detail.EyesOpen
        ? {
            value: detail.EyesOpen.Value ?? false,
            confidence: this.normalizeConfidence(detail.EyesOpen.Confidence),
          }
        : undefined,
      mouthOpen: detail.MouthOpen
        ? {
            value: detail.MouthOpen.Value ?? false,
            confidence: this.normalizeConfidence(detail.MouthOpen.Confidence),
          }
        : undefined,
    };
  }

  // =============================================================================
  // Encoding Helpers
  // =============================================================================

  /**
   * Convert ArrayBuffer to base64 string.
   * Used to encode image data for JSON transport.
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary);
  }
}
