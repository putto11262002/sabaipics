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
import { ResultAsync, ok, err } from 'neverthrow';
import { MyError, type MyErrorOptions } from '../error';

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
 * Base error for all Rekognition operations.
 * Extends MyError with AWS-specific error name preservation.
 *
 * @example
 * const err = new RekognitionError('Collection already exists', {
 *   retryable: false,
 *   name: 'ResourceAlreadyExistsException',
 *   cause: originalAwsError,
 * });
 */
export class RekognitionError extends MyError {
  constructor(message: string, options: MyErrorOptions) {
    super(message, options);
  }
}

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
 * Map AWS SDK error to RekognitionError.
 * Determines retryable and isThrottle based on error name.
 * Preserves original error name and cause for debugging.
 */
function mapAwsError(awsError: unknown): RekognitionError {
  const e = awsError as { name?: string; message?: string };

  const errorName = e.name ?? 'UnknownError';
  const retryable = RETRYABLE_AWS_ERRORS.has(errorName);
  const isThrottle = THROTTLE_AWS_ERRORS.has(errorName);

  return new RekognitionError(e.message ?? 'AWS error occurred', {
    name: errorName,
    retryable,
    isThrottle,
    cause: awsError,
  });
}

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
 * Create a Rekognition collection for an event.
 * Collection ID = event_id (UUID)
 *
 * @param client - Rekognition client
 * @param eventId - Event UUID
 * @returns Collection ARN
 */
export async function createCollection(
  client: RekognitionClient,
  eventId: string,
): Promise<string> {
  const collectionId = getCollectionId(eventId);

  const command = new CreateCollectionCommand({
    CollectionId: collectionId,
  });

  const response = await client.send(command);
  return response.CollectionArn ?? collectionId;
}

/**
 * Safe wrapper for createCollection using neverthrow Result.
 * Returns ResultAsync<string, RekognitionError> where string is the Collection ARN.
 *
 * @param client - Rekognition client
 * @param eventId - Event UUID
 * @returns ResultAsync with Collection ARN or RekognitionError
 */
export function createCollectionSafe(
  client: RekognitionClient,
  eventId: string,
): ResultAsync<string, RekognitionError> {
  const collectionId = getCollectionId(eventId);

  const command = new CreateCollectionCommand({
    CollectionId: collectionId,
  });

  return ResultAsync.fromPromise(client.send(command), mapAwsError).map(
    (response) => response.CollectionArn ?? collectionId,
  );
}

/**
 * Delete a Rekognition collection.
 * Called when event expires or is deleted.
 *
 * @param client - Rekognition client
 * @param eventId - Event UUID
 */
export async function deleteCollection(client: RekognitionClient, eventId: string): Promise<void> {
  const collectionId = getCollectionId(eventId);

  const command = new DeleteCollectionCommand({
    CollectionId: collectionId,
  });

  await client.send(command);
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
 * Returns ResultAsync<IndexFacesResult, RekognitionError>.
 *
 * @param client - Rekognition client
 * @param eventId - Event UUID (determines collection)
 * @param imageBytes - Image data as ArrayBuffer
 * @param photoId - Photo UUID (stored as ExternalImageId for reverse lookup)
 * @returns ResultAsync with IndexFacesResult or RekognitionError
 */
export function indexFacesSafe(
  client: RekognitionClient,
  eventId: string,
  imageBytes: ArrayBuffer,
  photoId: string,
): ResultAsync<IndexFacesResult, RekognitionError> {
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

  return ResultAsync.fromPromise(client.send(command), mapAwsError).map((response) => ({
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
