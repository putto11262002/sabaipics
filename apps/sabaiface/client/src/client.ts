/**
 * Face Recognition Client (Unified SDK)
 *
 * Routes to AWS or SabaiFace based on provider config.
 * All methods return ResultAsync for typed error handling.
 *
 * Usage:
 * ```typescript
 * const client = new FaceRecognitionClient({
 *   provider: 'sabaiface',
 *   endpoint: 'https://sabaiface.example.com',
 * });
 *
 * const result = await client.indexPhoto({
 *   eventId: 'event-123',
 *   photoId: 'photo-456',
 *   imageData: ArrayBuffer,
 * });
 *
 * if (result.isErr()) {
 *   const error = result.error;
 *   if (error.retryable) {
 *     // Retry with backoff
 *   }
 *   if (error.throttle) {
 *     // Rate limit hit
 *   }
 * }
 *
 * const indexed = result.value;
 * console.log(`Found ${indexed.faces.length} faces`);
 * ```
 */

import type { FaceClientConfig, IndexPhotoRequest, FindSimilarRequest, PhotoIndexed, SimilarFace } from './types';
import type { FaceServiceError } from './types';
import { AWSRekognitionClient } from './aws';
import { SabaiFaceHTTPClient } from './sabaiface';

// =============================================================================
// Face Recognition Client (Unified Facade)
// =============================================================================

/**
 * Face Recognition Client
 *
 * Unified SDK that routes to AWS or SabaiFace based on provider config.
 * All methods return ResultAsync for typed error handling.
 */
export class FaceRecognitionClient {
  private providerClient: AWSRekognitionClient | SabaiFaceHTTPClient;

  constructor(private config: FaceClientConfig) {
    if (config.provider === 'aws') {
      if (!config.aws) {
        throw new Error('AWS config required when provider is "aws"');
      }
      this.providerClient = new AWSRekognitionClient(config.aws);
    } else {
      if (!config.endpoint) {
        throw new Error('endpoint config required when provider is "sabaiface"');
      }
      this.providerClient = new SabaiFaceHTTPClient({ endpoint: config.endpoint });
    }
  }

  /**
   * Index faces from a photo.
   *
   * @returns ResultAsync with PhotoIndexed or FaceServiceError
   *
   * Example:
   * ```typescript
   * const result = await client.indexPhoto({
   *   eventId: 'event-123',
   *   photoId: 'photo-456',
   *   imageData: ArrayBuffer,
   *   options: { maxFaces: 100, qualityFilter: 'auto' },
   * });
   *
   * if (result.isErr()) {
   *   console.error('Failed to index photo:', result.error);
   *   return;
   * }
   *
   * const { faces, unindexedFaces } = result.value;
   * console.log(`Indexed ${faces.length} faces`);
   * ```
   */
  indexPhoto(request: IndexPhotoRequest) {
    return this.providerClient.indexPhoto(request);
  }

  /**
   * Find similar faces.
   *
   * @returns ResultAsync with SimilarFace[] or FaceServiceError
   *
   * Example:
   * ```typescript
   * const result = await client.findSimilarFaces({
   *   eventId: 'event-123',
   *   imageData: ArrayBuffer,
   *   maxResults: 10,
   *   minSimilarity: 0.8,
   * });
   *
   * if (result.isErr()) {
   *   console.error('Failed to find similar faces:', result.error);
   *   return [];
   * }
   *
   * const similarFaces = result.value;
   * console.log(`Found ${similarFaces.length} similar faces`);
   * ```
   */
  findSimilarFaces(request: FindSimilarRequest) {
    return this.providerClient.findSimilarFaces(request);
  }

  /**
   * Delete faces.
   *
   * @returns ResultAsync with void or FaceServiceError
   *
   * Example:
   * ```typescript
   * const result = await client.deleteFaces('event-123', ['face-1', 'face-2']);
   *
   * if (result.isErr()) {
   *   console.error('Failed to delete faces:', result.error);
   * }
   * ```
   */
  deleteFaces(eventId: string, faceIds: string[]) {
    return this.providerClient.deleteFaces(eventId, faceIds);
  }

  /**
   * Delete collection.
   *
   * @returns ResultAsync with void or FaceServiceError
   *
   * Example:
   * ```typescript
   * const result = await client.deleteCollection('event-123');
   *
   * if (result.isErr()) {
   *   console.error('Failed to delete collection:', result.error);
   * }
   * ```
   */
  deleteCollection(eventId: string) {
    return this.providerClient.deleteCollection(eventId);
  }

  /**
   * Create collection.
   *
   * @returns ResultAsync with collection ARN/identifier or FaceServiceError
   *
   * Example:
   * ```typescript
   * const result = await client.createCollection('event-123');
   *
   * if (result.isErr()) {
   *   console.error('Failed to create collection:', result.error);
   *   return;
   * }
   *
   * const collectionArn = result.value;
   * console.log('Created collection:', collectionArn);
   * ```
   */
  createCollection(eventId: string) {
    return this.providerClient.createCollection(eventId);
  }
}
