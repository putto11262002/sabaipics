import { Buffer } from 'node:buffer';
import { ResultAsync, err, ok, safeTry } from 'neverthrow';

import type {
  FaceRecognitionProvider,
  FaceServiceError,
  FindImagesByFaceRequest,
  FindImagesByFaceResponse,
  IndexPhotoRequest,
  PhotoIndexed,
} from './types.ts';

interface HTTPErrorResponse {
  message: string;
  type?: string;
  retryable?: boolean;
  throttle?: boolean;
}

const RETRYABLE_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const THROTTLE_HTTP_STATUSES = new Set([429]);

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

function normalizeConfidence(confidence?: number): number {
  if (confidence === undefined) return 0;
  return confidence / 100;
}

function transformIndexResponse(data: any): PhotoIndexed {
  return {
    faces:
      data.FaceRecords?.map((r: any) => ({
        faceId: r.Face?.FaceId || '',
        externalImageId: r.Face?.ExternalImageId,
      })) || [],
    unindexedFaces:
      data.UnindexedFaces?.map((f: any) => ({ reasons: f.Reasons?.map(String) || [] })) || [],
    modelVersion: data.FaceModelVersion,
    provider: 'sabaiface',
  };
}

function transformImageSearchResponse(data: any): FindImagesByFaceResponse {
  const photoMap = new Map<string, { similarity: number; faceCount: number }>();

  data.FaceMatches?.forEach((m: any) => {
    const photoId = m.Face?.ExternalImageId;
    if (!photoId) return;

    const similarity = normalizeConfidence(m.Similarity);
    const existing = photoMap.get(photoId);
    if (existing) {
      if (similarity > existing.similarity) existing.similarity = similarity;
      existing.faceCount += 1;
    } else {
      photoMap.set(photoId, { similarity, faceCount: 1 });
    }
  });

  const photos = Array.from(photoMap.entries()).map(([photoId, v]) => ({
    photoId,
    similarity: v.similarity,
    faceCount: v.faceCount,
  }));

  photos.sort((a, b) => b.similarity - a.similarity);
  return { photos, totalMatchedFaces: data.FaceMatches?.length || 0, provider: 'sabaiface' };
}

export interface SabaiFaceProviderConfig {
  endpoint: string;
}

export function createSabaiFaceProvider(config: SabaiFaceProviderConfig): FaceRecognitionProvider {
  const endpoint = config.endpoint.replace(/\/$/, '');

  const indexPhoto = (request: IndexPhotoRequest): ResultAsync<PhotoIndexed, FaceServiceError> =>
    safeTry(async function* () {
      const url = `${endpoint}/collections/${request.eventId}/index-faces`;
      const base64Image = Buffer.from(request.imageData).toString('base64');

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
          errorBody = (await response.json()) as HTTPErrorResponse;
        } catch {
          // ignore
        }
        return err(httpErrorToFaceServiceError(response.status, errorBody));
      }

      const data = yield* ResultAsync.fromPromise(
        response.json() as Promise<any>,
        jsonParseErrorToFaceServiceError,
      ).safeUnwrap();

      return ok(transformIndexResponse(data));
    });

  const findImagesByFace = (
    request: FindImagesByFaceRequest,
  ): ResultAsync<FindImagesByFaceResponse, FaceServiceError> =>
    safeTry(async function* () {
      const url = `${endpoint}/collections/${request.eventId}/search-faces-by-image`;
      const base64Image = Buffer.from(request.imageData).toString('base64');

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
          errorBody = (await response.json()) as HTTPErrorResponse;
        } catch {
          // ignore
        }
        return err(httpErrorToFaceServiceError(response.status, errorBody));
      }

      const data = yield* ResultAsync.fromPromise(
        response.json() as Promise<any>,
        jsonParseErrorToFaceServiceError,
      ).safeUnwrap();
      return ok(transformImageSearchResponse(data));
    });

  const deleteCollection = (eventId: string): ResultAsync<void, FaceServiceError> =>
    safeTry(async function* () {
      const response = yield* ResultAsync.fromPromise(
        fetch(`${endpoint}/collections/${eventId}`, { method: 'DELETE' }),
        networkErrorToFaceServiceError,
      ).safeUnwrap();

      if (!response.ok) {
        let errorBody: HTTPErrorResponse = { message: response.statusText };
        try {
          errorBody = (await response.json()) as HTTPErrorResponse;
        } catch {
          // ignore
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
          errorBody = (await response.json()) as HTTPErrorResponse;
        } catch {
          // ignore
        }
        return err(httpErrorToFaceServiceError(response.status, errorBody));
      }

      const data = yield* ResultAsync.fromPromise(
        response.json() as Promise<any>,
        jsonParseErrorToFaceServiceError,
      ).safeUnwrap();
      return ok(data.CollectionArn ?? eventId);
    });

  return { indexPhoto, findImagesByFace, deleteCollection, createCollection };
}
