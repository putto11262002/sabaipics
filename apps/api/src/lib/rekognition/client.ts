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
} from "@aws-sdk/client-rekognition";

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
 * Collection naming: sabaipics-{event_id}
 *
 * @param client - Rekognition client
 * @param eventId - Event UUID
 * @returns Collection ARN
 */
export async function createCollection(
  client: RekognitionClient,
  eventId: string
): Promise<string> {
  const collectionId = getCollectionId(eventId);

  const command = new CreateCollectionCommand({
    CollectionId: collectionId,
    Tags: {
      event_id: eventId,
      created_by: "sabaipics",
    },
  });

  const response = await client.send(command);
  return response.CollectionArn ?? collectionId;
}

/**
 * Delete a Rekognition collection.
 * Called when event expires or is deleted.
 *
 * @param client - Rekognition client
 * @param eventId - Event UUID
 */
export async function deleteCollection(
  client: RekognitionClient,
  eventId: string
): Promise<void> {
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
  photoId: string
): Promise<IndexFacesResult> {
  const collectionId = getCollectionId(eventId);

  const command = new IndexFacesCommand({
    CollectionId: collectionId,
    Image: {
      Bytes: new Uint8Array(imageBytes),
    },
    ExternalImageId: photoId,
    DetectionAttributes: ["ALL"], // Get all face attributes
    MaxFaces: 100, // Max faces to index per image
    QualityFilter: "AUTO", // Let Rekognition filter low quality
  });

  const response = await client.send(command);

  return {
    faceRecords: response.FaceRecords ?? [],
    unindexedFaces: response.UnindexedFaces ?? [],
    faceModelVersion: response.FaceModelVersion,
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get collection ID from event ID.
 * Format: sabaipics-{event_id}
 */
export function getCollectionId(eventId: string): string {
  return `sabaipics-${eventId}`;
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
} from "@aws-sdk/client-rekognition";
