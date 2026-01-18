/**
 * AWS Rekognition Provider (aws4fetch)
 *
 * Uses aws4fetch for Cloudflare Workers compatibility.
 * Lightweight alternative to AWS SDK v3 (~6KB vs ~400KB).
 *
 * Key design principles:
 * - Object-based (no classes)
 * - Error classification based ONLY on AWS __type field
 * - No retry logic (consumer handles retry)
 * - Normalizes confidence scores (0-100 → 0-1)
 * - Includes raw response for model training
 */

import { AwsClient } from 'aws4fetch';
import { ResultAsync, err, ok, safeTry } from 'neverthrow';
import { Buffer } from 'node:buffer';
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
  FaceRecognitionProvider,
  AWSRawFaceRecord,
} from './types';

// =============================================================================
// Error Classification
// =============================================================================

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
  if (typeName.includes(':')) {
    typeName = typeName.split(':')[0];
  }

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
  return {
    type: 'provider_failed',
    provider: 'aws',
    retryable: true,
    throttle: false,
    cause: e,
  };
}

function jsonParseErrorToFaceServiceError(e: unknown): FaceServiceError {
  return {
    type: 'provider_failed',
    provider: 'aws',
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
    age: detail.AgeRange
      ? { low: detail.AgeRange.Low, high: detail.AgeRange.High }
      : undefined,
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
  const awsFace = record.Face;
  return {
    faceId: awsFace?.FaceId || '',
    boundingBox: normalizeBoundingBox(awsFace?.BoundingBox),
    confidence: normalizeConfidence(awsFace?.Confidence),
    externalImageId: awsFace?.ExternalImageId,
    attributes: extractAttributes(record.FaceDetail),
    provider: 'aws',
    rawResponse: record as AWSRawFaceRecord, // Include raw response for training
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
    provider: 'aws',
  };
}

function transformSearchResponse(data: any): SimilarFace[] {
  return (
    data.FaceMatches?.map((m: any) => ({
      faceId: m.Face?.FaceId || '',
      similarity: normalizeConfidence(m.Similarity),
      boundingBox: m.Face?.BoundingBox
        ? normalizeBoundingBox(m.Face.BoundingBox)
        : undefined,
      confidence: normalizeConfidence(m.Face?.Confidence),
      externalImageId: m.Face?.ExternalImageId,
      provider: 'aws',
    })) || []
  );
}

// =============================================================================
// Client Factory
// =============================================================================

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
            QualityFilter: request.options?.qualityFilter?.toUpperCase() === 'NONE' ? 'NONE' : 'AUTO',
          }),
        }),
        networkErrorToFaceServiceError,
      ).safeUnwrap();

      const data = yield* ResultAsync.fromPromise(
        response.json() as Promise<any>,
        jsonParseErrorToFaceServiceError,
      ).safeUnwrap();

      if (data.__type) {
        return err(awsErrorToFaceServiceError(data.__type, data));
      }

      return ok(transformIndexResponse(data));
    });

  const findSimilarFaces = (request: FindSimilarRequest): ResultAsync<SimilarFace[], FaceServiceError> =>
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
            MaxFaces: request.maxResults ?? 10,
            FaceMatchThreshold: (request.minSimilarity ?? 0.8) * 100,
          }),
        }),
        networkErrorToFaceServiceError,
      ).safeUnwrap();

      const data = yield* ResultAsync.fromPromise(
        response.json() as Promise<any>,
        jsonParseErrorToFaceServiceError,
      ).safeUnwrap();

      if (data.__type) {
        return err(awsErrorToFaceServiceError(data.__type, data));
      }

      return ok(transformSearchResponse(data));
    });

  const deleteFaces = (eventId: string, faceIds: string[]): ResultAsync<void, FaceServiceError> =>
    safeTry(async function* () {
      const response = yield* ResultAsync.fromPromise(
        aws.fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': 'RekognitionService.DeleteFaces',
          },
          body: JSON.stringify({
            CollectionId: eventId,
            FaceIds: faceIds,
          }),
        }),
        networkErrorToFaceServiceError,
      ).safeUnwrap();

      const data = yield* ResultAsync.fromPromise(
        response.json() as Promise<any>,
        jsonParseErrorToFaceServiceError,
      ).safeUnwrap();

      if (data.__type) {
        return err(awsErrorToFaceServiceError(data.__type, data));
      }

      return ok(undefined);
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
          body: JSON.stringify({
            CollectionId: eventId,
          }),
        }),
        networkErrorToFaceServiceError,
      ).safeUnwrap();

      const data = yield* ResultAsync.fromPromise(
        response.json() as Promise<any>,
        jsonParseErrorToFaceServiceError,
      ).safeUnwrap();

      if (data.__type) {
        return err(awsErrorToFaceServiceError(data.__type, data));
      }

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
          body: JSON.stringify({
            CollectionId: eventId,
          }),
        }),
        networkErrorToFaceServiceError,
      ).safeUnwrap();

      const data = yield* ResultAsync.fromPromise(
        response.json() as Promise<any>,
        jsonParseErrorToFaceServiceError,
      ).safeUnwrap();

      if (data.__type) {
        return err(awsErrorToFaceServiceError(data.__type, data));
      }

      return ok(data.CollectionArn ?? eventId);
    });

  return {
    indexPhoto,
    findSimilarFaces,
    deleteFaces,
    deleteCollection,
    createCollection,
  };
}
