/**
 * AWS Rekognition Client (aws4fetch)
 *
 * Uses aws4fetch for Cloudflare Workers compatibility.
 * Lightweight alternative to AWS SDK v3 (~6KB vs ~400KB).
 *
 * Preserves all error handling behavior:
 * - Same RETRYABLE_AWS_ERRORS classification
 * - Same THROTTLE_AWS_ERRORS classification
 * - Same FaceServiceError format with retryable/throttle flags
 * - Same ResultAsync pattern for consumer compatibility
 *
 * Key design principles:
 * - Safe wrappers using ResultAsync.fromPromise
 * - No retry logic (consumer handles retry)
 * - Error type includes retryable and throttle flags
 * - Normalizes confidence scores (0-100 → 0-1)
 */

import { AwsClient } from 'aws4fetch';
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
} from './types';

// =============================================================================
// Error Types - PRESERVED FROM ORIGINAL
// =============================================================================

/**
 * AWS errors that are retryable (transient failures).
 * Same classification as AWS SDK version.
 */
const RETRYABLE_AWS_ERRORS = new Set([
  'ThrottlingException',
  'ProvisionedThroughputExceededException',
  'ServiceUnavailableException',
  'InternalServerError',
  'LimitExceededException',
]);

/**
 * AWS errors that are throttling (rate limit exceeded).
 * Same classification as AWS SDK version.
 */
const THROTTLE_AWS_ERRORS = new Set([
  'ThrottlingException',
  'ProvisionedThroughputExceededException',
  'LimitExceededException',
]);

/**
 * HTTP status codes that are retryable.
 * These map to AWS SDK retryable errors.
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
 * HTTP status codes that indicate throttling.
 */
const THROTTLE_HTTP_STATUSES = new Set([
  429, // Too Many Requests
]);

/**
 * Convert AWS error type to FaceServiceError.
 * Preserves the exact same logic as AWS SDK version.
 *
 * @param errorType - AWS error type from __type field
 * @param cause - Original error object
 */
function awsErrorTypeToFaceServiceError(errorType: string, cause?: unknown): FaceServiceError {
  // Remove any namespace prefix (e.g., "com.amazon.coral.service#ThrottlingException")
  const typeName = errorType.split('#').pop() || errorType;

  return {
    type: 'provider_failed',
    provider: 'aws',
    retryable: RETRYABLE_AWS_ERRORS.has(typeName),
    throttle: THROTTLE_AWS_ERRORS.has(typeName),
    cause: cause || new Error(errorType),
  };
}

/**
 * Convert HTTP error to FaceServiceError.
 * Maps HTTP status to AWS error classifications.
 *
 * @param status - HTTP status code
 * @param cause - Original error object
 */
function httpErrorToFaceServiceError(status: number, cause?: unknown): FaceServiceError {
  return {
    type: 'provider_failed',
    provider: 'aws',
    retryable: RETRYABLE_HTTP_STATUSES.has(status),
    throttle: THROTTLE_HTTP_STATUSES.has(status),
    cause: cause || new Error(`HTTP ${status}`),
  };
}

/**
 * Convert network error to FaceServiceError.
 * Network errors are generally retryable.
 */
function networkErrorToFaceServiceError(e: unknown): FaceServiceError {
  return {
    type: 'provider_failed',
    provider: 'aws',
    retryable: true,
    throttle: false,
    cause: e,
  };
}

// =============================================================================
// AWS Rekognition Client (aws4fetch)
// =============================================================================

export interface AWSClientConfig {
  region: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
}

/**
 * AWS Rekognition Client using aws4fetch
 *
 * Lightweight AWS Rekognition client for Cloudflare Workers.
 * Preserves exact same error handling as AWS SDK version.
 */
export class AWSRekognitionClient {
  private aws: AwsClient;
  private endpoint: string;

  constructor(config: AWSClientConfig) {
    this.aws = new AwsClient({
      accessKeyId: config.credentials.accessKeyId,
      secretAccessKey: config.credentials.secretAccessKey,
      region: config.region,
    });
    this.endpoint = `https://rekognition.${config.region}.amazonaws.com`;
  }

  /**
   * Handle fetch response with comprehensive error handling.
   *
   * Handles two types of errors:
   * 1. HTTP-level errors (4xx, 5xx status codes)
   * 2. Application-level errors (AWS returns 200 with __type field)
   *
   * Preserves retryable/throttle classification from original implementation.
   */
  private async handleResponse<T>(
    response: Response,
    transform: (data: any) => T
  ): ResultAsync<T, FaceServiceError> {
    // First, check for HTTP-level errors
    if (!response.ok) {
      return err(httpErrorToFaceServiceError(response.status, response));
    }

    // Parse response body
    let data: any;
    try {
      data = await response.json();
    } catch (e) {
      // Failed to parse JSON - treat as internal error
      return err({
        type: 'provider_failed',
        provider: 'aws',
        retryable: true,
        throttle: false,
        cause: e,
      });
    }

    // Check for application-level errors (AWS returns 200 OK with error body)
    // AWS Rekognition uses __type field to indicate errors
    if (data.__type) {
      return err(awsErrorTypeToFaceServiceError(data.__type, data));
    }

    // Success - transform response
    return ok(transform(data));
  }

  /**
   * Index faces from a photo.
   *
   * Preserves exact same behavior as AWS SDK version.
   * - Same ResultAsync pattern
   * - Same error classification
   * - Same response transformation
   */
  indexPhoto(request: IndexPhotoRequest): ResultAsync<PhotoIndexed, FaceServiceError> {
    return ResultAsync.fromPromise(
      this.aws.fetch(this.endpoint, {
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
      networkErrorToFaceServiceError
    ).andThen((response) => this.handleResponse(response, (data) => this.transformIndexResponse(data)));
  }

  /**
   * Find similar faces.
   *
   * Preserves exact same behavior as AWS SDK version.
   */
  findSimilarFaces(request: FindSimilarRequest): ResultAsync<SimilarFace[], FaceServiceError> {
    return ResultAsync.fromPromise(
      this.aws.fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'RekognitionService.SearchFacesByImage',
        },
        body: JSON.stringify({
          CollectionId: request.eventId,
          Image: { Bytes: Buffer.from(request.imageData).toString('base64') },
          MaxFaces: request.maxResults ?? 10,
          FaceMatchThreshold: (request.minSimilarity ?? 0.8) * 100, // 0-1 → 0-100
        }),
      }),
      networkErrorToFaceServiceError
    ).andThen((response) => this.handleResponse(response, (data) => this.transformSearchResponse(data)));
  }

  /**
   * Delete faces.
   *
   * Preserves exact same behavior as AWS SDK version.
   */
  deleteFaces(eventId: string, faceIds: string[]): ResultAsync<void, FaceServiceError> {
    return ResultAsync.fromPromise(
      this.aws.fetch(this.endpoint, {
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
      networkErrorToFaceServiceError
    ).andThen((response) => this.handleResponse(response, () => undefined));
  }

  /**
   * Delete collection.
   *
   * Preserves exact same behavior as AWS SDK version.
   */
  deleteCollection(eventId: string): ResultAsync<void, FaceServiceError> {
    return ResultAsync.fromPromise(
      this.aws.fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'RekognitionService.DeleteCollection',
        },
        body: JSON.stringify({
          CollectionId: eventId,
        }),
      }),
      networkErrorToFaceServiceError
    ).andThen((response) => this.handleResponse(response, () => undefined));
  }

  /**
   * Create collection.
   *
   * Preserves exact same behavior as AWS SDK version.
   */
  createCollection(eventId: string): ResultAsync<string, FaceServiceError> {
    return ResultAsync.fromPromise(
      this.aws.fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'RekognitionService.CreateCollection',
        },
        body: JSON.stringify({
          CollectionId: eventId,
        }),
      }),
      networkErrorToFaceServiceError
    ).andThen((response) =>
      this.handleResponse(response, (data) => data.CollectionArn ?? eventId)
    );
  }

  // =============================================================================
  // Transformation Helpers - SAME AS ORIGINAL
  // =============================================================================

  /**
   * Transform AWS IndexFaces response to domain PhotoIndexed model.
   * Normalizes confidence scores from 0-100 to 0-1.
   */
  private transformIndexResponse(data: any): PhotoIndexed {
    return {
      faces: data.FaceRecords?.map((r: any) => this.transformFaceRecord(r)) || [],
      unindexedFaces: data.UnindexedFaces?.map((f: any) => this.transformUnindexedFace(f)) || [],
      modelVersion: data.FaceModelVersion,
      provider: 'aws',
    };
  }

  /**
   * Transform AWS FaceRecord to domain Face model.
   */
  private transformFaceRecord(record: any): Face {
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
   * Transform AWS SearchFacesByImage response to domain SimilarFace[] model.
   */
  private transformSearchResponse(data: any): SimilarFace[] {
    return data.FaceMatches?.map((m: any) => ({
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
