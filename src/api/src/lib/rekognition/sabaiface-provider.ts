/**
 * SabaiFace HTTP Provider (Object-based)
 *
 * Makes HTTP requests to SabaiFace VPS service.
 * Uses fetch() for Cloudflare Workers compatibility.
 * Uses base64 encoding for binary image data (compatible with JSON).
 *
 * Key design principles:
 * - Object-based (no classes)
 * - Safe wrappers using safeTry from neverthrow
 * - No retry logic (consumer handles retry)
 * - Error type includes retryable and throttle flags
 * - Normalizes confidence scores to 0-1 scale
 * - Includes raw response for model training
 */

import { ResultAsync, err, ok, safeTry } from 'neverthrow';
import type {
  IndexPhotoRequest,
  FindSimilarRequest,
  FindImagesByFaceRequest,
  FindImagesByFaceResponse,
  PhotoMatch,
  PhotoIndexed,
  SimilarFace,
  Face,
  UnindexedFace,
  BoundingBox,
  FaceAttributes,
  FaceServiceError,
  FaceRecognitionProvider,
  SabaiFaceRawRecord,
} from './types';

// =============================================================================
// Error Classification
// =============================================================================

interface HTTPErrorResponse {
  message: string;
  type?: string;
  retryable?: boolean;
  throttle?: boolean;
}

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

function httpErrorToFaceServiceError(status: number, body: HTTPErrorResponse): FaceServiceError {
  return {
    type: 'provider_failed',
    provider: 'sabaiface',
    retryable: RETRYABLE_HTTP_STATUSES.has(status) || (body.retryable ?? false),
    throttle: THROTTLE_HTTP_STATUSES.has(status) || (body.throttle ?? false),
    cause: body,
  };
}

function networkErrorToFaceServiceError(e: unknown): FaceServiceError {
  return {
    type: 'provider_failed',
    provider: 'sabaiface',
    retryable: true,
    throttle: false,
    cause: e,
  };
}

function jsonParseErrorToFaceServiceError(e: unknown): FaceServiceError {
  return {
    type: 'provider_failed',
    provider: 'sabaiface',
    retryable: true,
    throttle: false,
    cause: e,
  };
}

// =============================================================================
// Response Transformers (pure functions)
// =============================================================================

function normalizeConfidence(confidence?: number): number {
  if (confidence === undefined) return 0;
  return confidence / 100;
}

function normalizeBoundingBox(box?: {
  Width?: number;
  Height?: number;
  Left?: number;
  Top?: number;
}): BoundingBox {
  return {
    width: box?.Width ?? 0,
    height: box?.Height ?? 0,
    left: box?.Left ?? 0,
    top: box?.Top ?? 0,
  };
}

function extractAttributes(detail?: any): FaceAttributes | undefined {
  if (!detail) return undefined;

  return {
    age: detail.AgeRange ? { low: detail.AgeRange.Low, high: detail.AgeRange.High } : undefined,
    gender: detail.Gender
      ? {
          value: detail.Gender.Value ?? '',
          confidence: normalizeConfidence(detail.Gender.Confidence),
        }
      : undefined,
    emotions: detail.Emotions?.map((e: any) => ({
      type: e.Type ?? '',
      confidence: normalizeConfidence(e.Confidence),
    })),
    smile: detail.Smile
      ? {
          value: detail.Smile.Value ?? false,
          confidence: normalizeConfidence(detail.Smile.Confidence),
        }
      : undefined,
    eyeglasses: detail.Eyeglasses
      ? {
          value: detail.Eyeglasses.Value ?? false,
          confidence: normalizeConfidence(detail.Eyeglasses.Confidence),
        }
      : undefined,
    sunglasses: detail.Sunglasses
      ? {
          value: detail.Sunglasses.Value ?? false,
          confidence: normalizeConfidence(detail.Sunglasses.Confidence),
        }
      : undefined,
    beard: detail.Beard
      ? {
          value: detail.Beard.Value ?? false,
          confidence: normalizeConfidence(detail.Beard.Confidence),
        }
      : undefined,
    mustache: detail.Mustache
      ? {
          value: detail.Mustache.Value ?? false,
          confidence: normalizeConfidence(detail.Mustache.Confidence),
        }
      : undefined,
    eyesOpen: detail.EyesOpen
      ? {
          value: detail.EyesOpen.Value ?? false,
          confidence: normalizeConfidence(detail.EyesOpen.Confidence),
        }
      : undefined,
    mouthOpen: detail.MouthOpen
      ? {
          value: detail.MouthOpen.Value ?? false,
          confidence: normalizeConfidence(detail.MouthOpen.Confidence),
        }
      : undefined,
  };
}

function transformFaceRecord(record: any): Face {
  const face = record.Face;
  return {
    faceId: face?.FaceId || '',
    boundingBox: normalizeBoundingBox(face?.BoundingBox),
    confidence: normalizeConfidence(face?.Confidence),
    externalImageId: face?.ExternalImageId,
    attributes: extractAttributes(record.FaceDetail),
    provider: 'sabaiface',
    rawResponse: record as SabaiFaceRawRecord, // Include raw response for training
  };
}

function transformUnindexedFace(face: any): UnindexedFace {
  return {
    faceDetail: face.FaceDetail
      ? {
          boundingBox: normalizeBoundingBox(face.FaceDetail.BoundingBox),
          confidence: normalizeConfidence(face.FaceDetail.Confidence),
        }
      : undefined,
    reasons: face.Reasons?.map((r: string | bigint) => String(r)) || [],
  };
}

function transformIndexResponse(data: any): PhotoIndexed {
  return {
    faces: data.FaceRecords?.map(transformFaceRecord) || [],
    unindexedFaces: data.UnindexedFaces?.map(transformUnindexedFace) || [],
    modelVersion: data.FaceModelVersion,
    provider: 'sabaiface',
  };
}

function transformSearchResponse(data: any): SimilarFace[] {
  return (
    data.FaceMatches?.map((m: any) => ({
      faceId: m.Face?.FaceId || '',
      similarity: normalizeConfidence(m.Similarity),
      boundingBox: m.Face?.BoundingBox ? normalizeBoundingBox(m.Face.BoundingBox) : undefined,
      confidence: normalizeConfidence(m.Face?.Confidence),
      externalImageId: m.Face?.ExternalImageId,
      provider: 'sabaiface',
    })) || []
  );
}

function transformImageSearchResponse(data: any): FindImagesByFaceResponse {
  // Aggregate face matches by externalImageId (our photoId)
  const photoMap = new Map<string, PhotoMatch>();

  data.FaceMatches?.forEach((m: any) => {
    const photoId = m.Face?.ExternalImageId;
    if (!photoId) return;

    const similarity = normalizeConfidence(m.Similarity);

    const existing = photoMap.get(photoId);
    if (existing) {
      // Keep highest similarity score
      if (similarity > existing.similarity) {
        existing.similarity = similarity;
      }
      // Increment face count
      existing.faceCount = (existing.faceCount ?? 1) + 1;
    } else {
      // New photo match
      photoMap.set(photoId, {
        photoId,
        similarity,
        faceCount: 1,
      });
    }
  });

  return {
    photos: Array.from(photoMap.values()),
    totalMatchedFaces: data.FaceMatches?.length || 0,
    provider: 'sabaiface',
  };
}

// =============================================================================
// Encoding Helpers
// =============================================================================

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

// =============================================================================
// Client Factory
// =============================================================================

export interface SabaiFaceProviderConfig {
  endpoint: string;
}

export function createSabaiFaceProvider(config: SabaiFaceProviderConfig): FaceRecognitionProvider {
  const endpoint = config.endpoint;

  const indexPhoto = (request: IndexPhotoRequest): ResultAsync<PhotoIndexed, FaceServiceError> =>
    safeTry(async function* () {
      const url = `${endpoint}/collections/${request.eventId}/index-faces`;
      const base64Image = arrayBufferToBase64(request.imageData);

      const response = yield* ResultAsync.fromPromise(
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
        networkErrorToFaceServiceError,
      ).safeUnwrap();

      if (!response.ok) {
        let errorBody: HTTPErrorResponse = { message: response.statusText };
        try {
          errorBody = await response.json();
        } catch {
          // Use default error if JSON parsing fails
        }
        return err(httpErrorToFaceServiceError(response.status, errorBody));
      }

      const data = yield* ResultAsync.fromPromise(
        response.json() as Promise<any>,
        jsonParseErrorToFaceServiceError,
      ).safeUnwrap();

      return ok(transformIndexResponse(data));
    });

  const findSimilarFaces = (
    request: FindSimilarRequest,
  ): ResultAsync<SimilarFace[], FaceServiceError> =>
    safeTry(async function* () {
      const url = `${endpoint}/collections/${request.eventId}/search-faces-by-image`;
      const base64Image = arrayBufferToBase64(request.imageData);

      const response = yield* ResultAsync.fromPromise(
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            Image: { Bytes: base64Image },
            MaxFaces: request.maxResults ?? 10,
            FaceMatchThreshold: (request.minSimilarity ?? 0.8) * 100,
          }),
        }),
        networkErrorToFaceServiceError,
      ).safeUnwrap();

      if (!response.ok) {
        let errorBody: HTTPErrorResponse = { message: response.statusText };
        try {
          errorBody = await response.json();
        } catch {
          // Use default error if JSON parsing fails
        }
        return err(httpErrorToFaceServiceError(response.status, errorBody));
      }

      const data = yield* ResultAsync.fromPromise(
        response.json() as Promise<any>,
        jsonParseErrorToFaceServiceError,
      ).safeUnwrap();

      return ok(transformSearchResponse(data));
    });

  const findImagesByFace = (
    request: FindImagesByFaceRequest,
  ): ResultAsync<FindImagesByFaceResponse, FaceServiceError> =>
    safeTry(async function* () {
      const url = `${endpoint}/collections/${request.eventId}/search-faces-by-image`;
      const base64Image = arrayBufferToBase64(request.imageData);

      // Use multiplier for aggregation: request more faces to get more unique photos
      const maxFacesMultiplier = 3;
      const maxFaces = (request.maxResults ?? 10) * maxFacesMultiplier;

      const response = yield* ResultAsync.fromPromise(
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            Image: { Bytes: base64Image },
            MaxFaces: maxFaces,
            FaceMatchThreshold: (request.minSimilarity ?? 0.8) * 100,
          }),
        }),
        networkErrorToFaceServiceError,
      ).safeUnwrap();

      if (!response.ok) {
        let errorBody: HTTPErrorResponse = { message: response.statusText };
        try {
          errorBody = await response.json();
        } catch {
          // Use default error if JSON parsing fails
        }
        return err(httpErrorToFaceServiceError(response.status, errorBody));
      }

      const data = yield* ResultAsync.fromPromise(
        response.json() as Promise<any>,
        jsonParseErrorToFaceServiceError,
      ).safeUnwrap();

      return ok(transformImageSearchResponse(data));
    });

  const deleteFaces = (eventId: string, faceIds: string[]): ResultAsync<void, FaceServiceError> =>
    safeTry(async function* () {
      const params = new URLSearchParams();
      faceIds.forEach((id) => params.append('faceId', id));

      const response = yield* ResultAsync.fromPromise(
        fetch(`${endpoint}/collections/${eventId}/faces?${params}`, {
          method: 'DELETE',
        }),
        networkErrorToFaceServiceError,
      ).safeUnwrap();

      if (!response.ok) {
        let errorBody: HTTPErrorResponse = { message: response.statusText };
        try {
          errorBody = await response.json();
        } catch {
          // Use default error if JSON parsing fails
        }
        return err(httpErrorToFaceServiceError(response.status, errorBody));
      }

      return ok(undefined);
    });

  const deleteCollection = (eventId: string): ResultAsync<void, FaceServiceError> =>
    safeTry(async function* () {
      const response = yield* ResultAsync.fromPromise(
        fetch(`${endpoint}/collections/${eventId}`, {
          method: 'DELETE',
        }),
        networkErrorToFaceServiceError,
      ).safeUnwrap();

      if (!response.ok) {
        let errorBody: HTTPErrorResponse = { message: response.statusText };
        try {
          errorBody = await response.json();
        } catch {
          // Use default error if JSON parsing fails
        }
        return err(httpErrorToFaceServiceError(response.status, errorBody));
      }

      return ok(undefined);
    });

  const createCollection = (eventId: string): ResultAsync<string, FaceServiceError> =>
    safeTry(async function* () {
      const response = yield* ResultAsync.fromPromise(
        fetch(`${endpoint}/collections`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ CollectionId: eventId }),
        }),
        networkErrorToFaceServiceError,
      ).safeUnwrap();

      if (!response.ok) {
        let errorBody: HTTPErrorResponse = { message: response.statusText };
        try {
          errorBody = await response.json();
        } catch {
          // Use default error if JSON parsing fails
        }
        return err(httpErrorToFaceServiceError(response.status, errorBody));
      }

      const data = yield* ResultAsync.fromPromise(
        response.json() as Promise<any>,
        jsonParseErrorToFaceServiceError,
      ).safeUnwrap();

      return ok(data.CollectionArn ?? eventId);
    });

  return {
    indexPhoto,
    findSimilarFaces,
    findImagesByFace,
    deleteFaces,
    deleteCollection,
    createCollection,
  };
}
