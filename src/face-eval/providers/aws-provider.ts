import { AwsClient } from 'aws4fetch';
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

const RETRYABLE_AWS_ERRORS = new Set([
  'ThrottlingException',
  'ProvisionedThroughputExceededException',
  'ServiceUnavailableException',
  'InternalServerError',
  'LimitExceededException',
]);

const THROTTLE_AWS_ERRORS = new Set([
  'ThrottlingException',
  'ProvisionedThroughputExceededException',
  'LimitExceededException',
]);

function awsErrorToFaceServiceError(errorType: string, cause?: unknown): FaceServiceError {
  let typeName = errorType.split('#').pop() || errorType;
  if (typeName.includes(':')) typeName = typeName.split(':')[0];
  return {
    type: 'provider_failed',
    provider: 'aws',
    retryable: RETRYABLE_AWS_ERRORS.has(typeName),
    throttle: THROTTLE_AWS_ERRORS.has(typeName),
    errorName: typeName,
    cause: cause || new Error(errorType),
  };
}

function networkErrorToFaceServiceError(e: unknown): FaceServiceError {
  return { type: 'provider_failed', provider: 'aws', retryable: true, throttle: false, cause: e };
}

function jsonParseErrorToFaceServiceError(e: unknown): FaceServiceError {
  return { type: 'provider_failed', provider: 'aws', retryable: true, throttle: false, cause: e };
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
    provider: 'aws',
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
  return { photos, totalMatchedFaces: data.FaceMatches?.length || 0, provider: 'aws' };
}

export interface AWSProviderConfig {
  region: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
}

export function createAWSProvider(config: AWSProviderConfig): FaceRecognitionProvider {
  const aws = new AwsClient({
    accessKeyId: config.credentials.accessKeyId,
    secretAccessKey: config.credentials.secretAccessKey,
    region: config.region,
  });

  const endpoint = `https://rekognition.${config.region}.amazonaws.com`;

  const indexPhoto = (request: IndexPhotoRequest): ResultAsync<PhotoIndexed, FaceServiceError> =>
    safeTry(async function* () {
      const response = yield* ResultAsync.fromPromise(
        aws.fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': 'RekognitionService.IndexFaces',
          },
          body: JSON.stringify({
            CollectionId: request.eventId,
            Image: { Bytes: Buffer.from(request.imageData).toString('base64') },
            ExternalImageId: request.photoId,
            DetectionAttributes: ['ALL'],
            MaxFaces: request.options?.maxFaces ?? 100,
            QualityFilter:
              request.options?.qualityFilter?.toUpperCase() === 'NONE' ? 'NONE' : 'AUTO',
          }),
        }),
        networkErrorToFaceServiceError,
      ).safeUnwrap();

      const data = yield* ResultAsync.fromPromise(
        response.json() as Promise<any>,
        jsonParseErrorToFaceServiceError,
      ).safeUnwrap();

      if (data.__type) return err(awsErrorToFaceServiceError(data.__type, data));
      return ok(transformIndexResponse(data));
    });

  const findImagesByFace = (
    request: FindImagesByFaceRequest,
  ): ResultAsync<FindImagesByFaceResponse, FaceServiceError> =>
    safeTry(async function* () {
      const response = yield* ResultAsync.fromPromise(
        aws.fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': 'RekognitionService.SearchFacesByImage',
          },
          body: JSON.stringify({
            CollectionId: request.eventId,
            Image: { Bytes: Buffer.from(request.imageData).toString('base64') },
            MaxFaces: (request.maxResults ?? 10) * 2,
            FaceMatchThreshold: (request.minSimilarity ?? 0.8) * 100,
          }),
        }),
        networkErrorToFaceServiceError,
      ).safeUnwrap();

      const data = yield* ResultAsync.fromPromise(
        response.json() as Promise<any>,
        jsonParseErrorToFaceServiceError,
      ).safeUnwrap();
      if (data.__type) return err(awsErrorToFaceServiceError(data.__type, data));
      return ok(transformImageSearchResponse(data));
    });

  const deleteCollection = (eventId: string): ResultAsync<void, FaceServiceError> =>
    safeTry(async function* () {
      const response = yield* ResultAsync.fromPromise(
        aws.fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': 'RekognitionService.DeleteCollection',
          },
          body: JSON.stringify({ CollectionId: eventId }),
        }),
        networkErrorToFaceServiceError,
      ).safeUnwrap();

      const data = yield* ResultAsync.fromPromise(
        response.json() as Promise<any>,
        jsonParseErrorToFaceServiceError,
      ).safeUnwrap();

      if (data.__type) return err(awsErrorToFaceServiceError(data.__type, data));
      return ok(undefined);
    });

  const createCollection = (eventId: string): ResultAsync<string, FaceServiceError> =>
    safeTry(async function* () {
      const response = yield* ResultAsync.fromPromise(
        aws.fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': 'RekognitionService.CreateCollection',
          },
          body: JSON.stringify({ CollectionId: eventId }),
        }),
        networkErrorToFaceServiceError,
      ).safeUnwrap();

      const data = yield* ResultAsync.fromPromise(
        response.json() as Promise<any>,
        jsonParseErrorToFaceServiceError,
      ).safeUnwrap();

      if (data.__type) return err(awsErrorToFaceServiceError(data.__type, data));
      return ok(data.CollectionArn ?? eventId);
    });

  return { indexPhoto, findImagesByFace, deleteCollection, createCollection };
}
