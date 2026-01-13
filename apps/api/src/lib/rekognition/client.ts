/**
 * AWS Rekognition Client
 *
 * Wrapper for Rekognition SDK with typed helpers for our use cases.
 */

import {
  RekognitionClient,
  IndexFacesCommand,
  CreateCollectionCommand,
  DeleteCollectionCommand,
  type IndexFacesCommandOutput,
  type FaceRecord,
  type UnindexedFace,
} from '@aws-sdk/client-rekognition';
import { ResultAsync } from 'neverthrow';

// =============================================================================
// Types
// =============================================================================

export interface RekognitionEnv {
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
}

export interface IndexFacesResult {
  faceRecords: FaceRecord[];
  unindexedFaces: UnindexedFace[];
  faceModelVersion?: string;
}

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
 * These set isThrottle=true to signal the rate limiter.
 */
const THROTTLE_AWS_ERRORS = new Set([
  'ThrottlingException',
  'ProvisionedThroughputExceededException',
  'LimitExceededException',
]);

/**
 * Plain object error type for Rekognition operations.
 * Uses discriminated union pattern for typed error handling.
 */
export type AWSRekognitionError = {
  type: 'AWSRekognitionError';
  name: string;
  retryable: boolean;
  throttle: boolean;
  cause: unknown;
};

/**
 * Convert unknown error to typed AWSRekognitionError.
 * Wraps AWS SDK exceptions at the boundary.
 */
export const toAWSRekognitionError = (e: unknown): AWSRekognitionError => {
  const awsErr = e as { name?: string };
  const name = awsErr.name ?? 'UnknownError';

  return {
    type: 'AWSRekognitionError',
    name,
    retryable: RETRYABLE_AWS_ERRORS.has(name),
    throttle: THROTTLE_AWS_ERRORS.has(name),
    cause: e,
  };
};

// =============================================================================
// Client Factory
// =============================================================================

/**
 * Create a Rekognition client from environment bindings.
 */
export function createRekognitionClient(env: RekognitionEnv): RekognitionClient {
  return new RekognitionClient({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

// =============================================================================
// Collection Operations
// =============================================================================

/**
 * Safe wrapper for createCollection using neverthrow Result.
 * Returns ResultAsync<string, AWSRekognitionError> where string is the Collection ARN.
 *
 * Uses plain object error pattern (discriminated union) for typed error handling.
 *
 * @param client - Rekognition client
 * @param eventId - Event UUID
 * @returns ResultAsync with Collection ARN or AWSRekognitionError
 */
export function createCollectionSafe(
  client: RekognitionClient,
  eventId: string,
): ResultAsync<string, AWSRekognitionError> {
  const collectionId = getCollectionId(eventId);

  const command = new CreateCollectionCommand({
    CollectionId: collectionId,
  });

  return ResultAsync.fromPromise(client.send(command), toAWSRekognitionError).map(
    (response) => response.CollectionArn ?? collectionId,
  );
}

/**
 * Safe wrapper for deleteCollection using neverthrow Result.
 * Returns ResultAsync<void, AWSRekognitionError>.
 *
 * Uses plain object error pattern (discriminated union) for typed error handling.
 *
 * @param client - Rekognition client
 * @param eventId - Event UUID
 * @returns ResultAsync with void or AWSRekognitionError
 */
export function deleteCollectionSafe(
  client: RekognitionClient,
  eventId: string,
): ResultAsync<void, AWSRekognitionError> {
  const collectionId = getCollectionId(eventId);

  const command = new DeleteCollectionCommand({
    CollectionId: collectionId,
  });

  return ResultAsync.fromPromise(client.send(command), toAWSRekognitionError).map(() => undefined);
}

// =============================================================================
// Face Indexing
// =============================================================================

/**
 * Index faces from an image into a collection.
 *
 * @param client - Rekognition client
 * @param eventId - Event UUID (determines collection)
 * @param imageBytes - Image data as ArrayBuffer
 * @param photoId - Photo UUID (stored as ExternalImageId for reverse lookup)
 * @returns Indexed faces and unindexed faces with reasons
 */
export async function indexFaces(
  client: RekognitionClient,
  eventId: string,
  imageBytes: ArrayBuffer,
  photoId: string,
): Promise<IndexFacesResult> {
  const collectionId = getCollectionId(eventId);

  const command = new IndexFacesCommand({
    CollectionId: collectionId,
    Image: {
      Bytes: new Uint8Array(imageBytes),
    },
    ExternalImageId: photoId,
    DetectionAttributes: ['ALL'], // Get all face attributes
    MaxFaces: 100, // Max faces to index per image
    QualityFilter: 'AUTO', // Let Rekognition filter low quality
  });

  const response = await client.send(command);

  return {
    faceRecords: response.FaceRecords ?? [],
    unindexedFaces: response.UnindexedFaces ?? [],
    faceModelVersion: response.FaceModelVersion,
  };
}

/**
 * Safe wrapper for indexFaces using neverthrow Result.
 * Returns ResultAsync<IndexFacesResult, AWSRekognitionError>.
 *
 * Uses plain object error pattern (discriminated union) for typed error handling.
 * Callers can switch on err.name for specific AWS error handling.
 *
 * @param client - Rekognition client
 * @param eventId - Event UUID (determines collection)
 * @param imageBytes - Image data as ArrayBuffer
 * @param photoId - Photo UUID (stored as ExternalImageId for reverse lookup)
 * @returns ResultAsync with IndexFacesResult or AWSRekognitionError
 */
export function indexFacesSafe(
  client: RekognitionClient,
  eventId: string,
  imageBytes: ArrayBuffer,
  photoId: string,
): ResultAsync<IndexFacesResult, AWSRekognitionError> {
  const collectionId = getCollectionId(eventId);

  const command = new IndexFacesCommand({
    CollectionId: collectionId,
    Image: {
      Bytes: new Uint8Array(imageBytes),
    },
    ExternalImageId: photoId,
    DetectionAttributes: ['ALL'], // Get all face attributes
    MaxFaces: 100, // Max faces to index per image
    QualityFilter: 'AUTO', // Let Rekognition filter low quality
  });

  return ResultAsync.fromPromise(client.send(command), toAWSRekognitionError).map((response) => ({
    faceRecords: response.FaceRecords ?? [],
    unindexedFaces: response.UnindexedFaces ?? [],
    faceModelVersion: response.FaceModelVersion,
  }));
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get collection ID from event ID.
 * Uses event UUID directly as collection ID.
 */
export function getCollectionId(eventId: string): string {
  return eventId;
}

// Re-export SDK types for convenience
export type {
  FaceRecord,
  UnindexedFace,
  FaceDetail,
  Face,
  BoundingBox,
  AgeRange,
  Emotion,
  Landmark,
  Pose,
  ImageQuality,
  Reason,
} from '@aws-sdk/client-rekognition';

