/**
 * AWS Rekognition Client Wrapper
 *
 * Wraps AWS SDK for consistent interface with SabaiFace client.
 * Uses safe wrappers with ResultAsync for typed error handling.
 * Follows the same style as lib/rekognition/client.ts (no retry logic).
 *
 * Key design principles:
 * - Safe wrappers using ResultAsync.fromPromise
 * - No retry logic (consumer handles retry)
 * - Error type includes retryable and throttle flags
 * - Normalizes confidence scores (0-100 → 0-1)
 */

import {
  RekognitionClient,
  IndexFacesCommand,
  SearchFacesByImageCommand,
  DeleteFacesCommand,
  DeleteCollectionCommand,
  CreateCollectionCommand,
  type IndexFacesCommandOutput,
  type SearchFacesByImageCommandOutput,
} from '@aws-sdk/client-rekognition';
import { ResultAsync } from 'neverthrow';
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
} from './types';

// =============================================================================
// Error Types
// =============================================================================

/**
 * AWS SDK errors that are retryable (transient failures).
 */
const RETRYABLE_AWS_ERRORS = new Set([
  'ThrottlingException',
  'ProvisionedThroughputExceededException',
  'ServiceUnavailableException',
  'InternalServerError',
  'LimitExceededException',
]);

/**
 * AWS SDK errors that are throttling (rate limit exceeded).
 */
const THROTTLE_AWS_ERRORS = new Set([
  'ThrottlingException',
  'ProvisionedThroughputExceededException',
  'LimitExceededException',
]);

/**
 * Convert AWS error to FaceServiceError.
 * Extracts retryable and throttle flags from AWS error.
 */
function awsErrorToFaceServiceError(e: unknown): FaceServiceError {
  const awsErr = e as { name?: string; message?: string };
  const name = awsErr.name ?? 'UnknownError';

  return {
    type: 'provider_failed',
    provider: 'aws',
    retryable: RETRYABLE_AWS_ERRORS.has(name),
    throttle: THROTTLE_AWS_ERRORS.has(name),
    cause: e,
  };
}

// =============================================================================
// AWS Rekognition Client
// =============================================================================

export interface AWSClientConfig {
  region: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
}

/**
 * AWS Rekognition Client
 *
 * Wraps AWS SDK with ResultAsync for consistent error handling.
 * Does NOT implement retry logic - consumer handles that.
 */
export class AWSRekognitionClient {
  private client: RekognitionClient;

  constructor(config: AWSClientConfig) {
    this.client = new RekognitionClient({
      region: config.region,
      credentials: config.credentials,
    });
  }

  /**
   * Index faces from a photo.
   *
   * Uses ResultAsync.fromPromise for safe error handling.
   * No retry logic - consumer checks error.retryable.
   */
  indexPhoto(request: IndexPhotoRequest): ResultAsync<PhotoIndexed, FaceServiceError> {
    const command = new IndexFacesCommand({
      CollectionId: request.eventId,
      Image: { Bytes: new Uint8Array(request.imageData) },
      ExternalImageId: request.photoId,
      DetectionAttributes: ['ALL'],
      MaxFaces: request.options?.maxFaces ?? 100,
      QualityFilter: request.options?.qualityFilter?.toUpperCase() === 'NONE' ? 'NONE' : 'AUTO',
    });

    return ResultAsync.fromPromise(
      this.client.send(command),
      awsErrorToFaceServiceError
    ).map((response) => this.transformIndexResponse(response));
  }

  /**
   * Find similar faces.
   *
   * Uses ResultAsync.fromPromise for safe error handling.
   * No retry logic - consumer checks error.retryable.
   */
  findSimilarFaces(request: FindSimilarRequest): ResultAsync<SimilarFace[], FaceServiceError> {
    const command = new SearchFacesByImageCommand({
      CollectionId: request.eventId,
      Image: { Bytes: new Uint8Array(request.imageData) },
      MaxFaces: request.maxResults ?? 10,
      FaceMatchThreshold: (request.minSimilarity ?? 0.8) * 100, // 0-1 → 0-100
    });

    return ResultAsync.fromPromise(
      this.client.send(command),
      awsErrorToFaceServiceError
    ).map((response) => this.transformSearchResponse(response));
  }

  /**
   * Delete faces.
   *
   * Uses ResultAsync.fromPromise for safe error handling.
   */
  deleteFaces(eventId: string, faceIds: string[]): ResultAsync<void, FaceServiceError> {
    return ResultAsync.fromPromise(
      this.client.send(new DeleteFacesCommand({
        CollectionId: eventId,
        FaceIds: faceIds,
      })),
      awsErrorToFaceServiceError
    ).map(() => undefined);
  }

  /**
   * Delete collection.
   *
   * Uses ResultAsync.fromPromise for safe error handling.
   */
  deleteCollection(eventId: string): ResultAsync<void, FaceServiceError> {
    return ResultAsync.fromPromise(
      this.client.send(new DeleteCollectionCommand({
        CollectionId: eventId,
      })),
      awsErrorToFaceServiceError
    ).map(() => undefined);
  }

  /**
   * Create collection.
   *
   * Uses ResultAsync.fromPromise for safe error handling.
   */
  createCollection(eventId: string): ResultAsync<string, FaceServiceError> {
    return ResultAsync.fromPromise(
      this.client.send(new CreateCollectionCommand({
        CollectionId: eventId,
      })),
      awsErrorToFaceServiceError
    ).map((response) => response.CollectionArn ?? eventId);
  }

  // =============================================================================
  // Transformation Helpers
  // =============================================================================

  /**
   * Transform AWS IndexFaces response to domain PhotoIndexed model.
   * Normalizes confidence scores from 0-100 to 0-1.
   */
  private transformIndexResponse(response: IndexFacesCommandOutput): PhotoIndexed {
    return {
      faces: response.FaceRecords?.map((r) => this.transformFaceRecord(r)) || [],
      unindexedFaces: response.UnindexedFaces?.map((f) => this.transformUnindexedFace(f)) || [],
      modelVersion: response.FaceModelVersion,
      provider: 'aws',
    };
  }

  /**
   * Transform AWS FaceRecord to domain Face model.
   */
  private transformFaceRecord(record: {
    Face?: {
      FaceId?: string;
      BoundingBox?: { Width?: number; Height?: number; Left?: number; Top?: number };
      Confidence?: number;
      ExternalImageId?: string;
    };
    FaceDetail?: any;
  }): Face {
    const awsFace = record.Face;

    return {
      faceId: awsFace?.FaceId || '',
      boundingBox: this.normalizeBoundingBox(awsFace?.BoundingBox),
      confidence: this.normalizeConfidence(awsFace?.Confidence),
      externalImageId: awsFace?.ExternalImageId,
      attributes: this.extractAttributes(record.FaceDetail),
      provider: 'aws',
    };
  }

  /**
   * Transform AWS UnindexedFace to domain UnindexedFace model.
   */
  private transformUnindexedFace(face: {
    FaceDetail?: any;
    Reasons?: Array<string | bigint>;
  }): UnindexedFace {
    return {
      faceDetail: face.FaceDetail
        ? {
            boundingBox: this.normalizeBoundingBox(face.FaceDetail.BoundingBox),
            confidence: this.normalizeConfidence(face.FaceDetail.Confidence),
          }
        : undefined,
      reasons: face.Reasons?.map((r) => String(r)) || [],
    };
  }

  /**
   * Transform AWS SearchFacesByImage response to domain SimilarFace[] model.
   */
  private transformSearchResponse(response: SearchFacesByImageCommandOutput): SimilarFace[] {
    return response.FaceMatches?.map((m) => ({
      faceId: m.Face?.FaceId || '',
      similarity: this.normalizeConfidence(m.Similarity),
      boundingBox: m.Face?.BoundingBox ? this.normalizeBoundingBox(m.Face.BoundingBox) : undefined,
      confidence: this.normalizeConfidence(m.Face?.Confidence),
      externalImageId: m.Face?.ExternalImageId,
      provider: 'aws',
    })) || [];
  }

  /**
   * Normalize AWS BoundingBox to domain BoundingBox (all fields 0-1).
   * AWS already uses 0-1 scale, just rename properties.
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
   * Normalize AWS confidence (0-100) to domain confidence (0-1).
   */
  private normalizeConfidence(confidence?: number): number {
    if (confidence === undefined) return 0;
    return confidence / 100;
  }

  /**
   * Extract face attributes from AWS FaceDetail.
   * Converts AWS capitalized fields to domain format.
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
}
