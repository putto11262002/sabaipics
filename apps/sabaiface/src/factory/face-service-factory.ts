/**
 * Face Service Factory
 *
 * Creates the appropriate FaceService implementation based on provider.
 * Handles dependency injection for each adapter.
 */

import type { RekognitionClient } from '@aws-sdk/client-rekognition';
import type { InternalDatabase } from '../db';
import type { FaceService } from '../domain/face-service';
import { AWSFaceAdapter } from '../adapters/aws/aws-adapter';
import { SabaiFaceAdapter } from '../adapters/sabaiface/sabaiface-adapter';
import { PostgresVectorStore } from '../adapters/postgres/postgres-vector-store';
import type { FaceDetector } from '../core/face-detector';
import type { VectorStore } from '../core/vector-store';

// =============================================================================
// Factory Configuration
// =============================================================================

/**
 * Configuration for AWS provider
 */
export interface AWSProviderConfig {
  provider: 'aws';
  client: RekognitionClient;
  db: InternalDatabase;
}

/**
 * Configuration for SabaiFace provider
 */
export interface SabaiFaceProviderConfig {
  provider: 'sabaiface';
  faceDetector: FaceDetector;
  vectorStore?: VectorStore; // Optional - will default to PostgresVectorStore
  db: InternalDatabase;
}

/**
 * Union type for provider configurations
 */
export type ProviderConfig = AWSProviderConfig | SabaiFaceProviderConfig;

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a FaceService instance based on provider configuration.
 *
 * @param config - Provider-specific configuration
 * @returns FaceService implementation
 *
 * @example
 * // AWS provider
 * const awsService = createFaceService({
 *   provider: 'aws',
 *   client: rekognitionClient,
 *   db: database,
 * });
 *
 * @example
 * // SabaiFace provider
 * const sabaiFaceService = createFaceService({
 *   provider: 'sabaiface',
 *   faceDetector: detector,
 *   vectorStore: store,
 *   db: database,
 * });
 */
export function createFaceService(config: ProviderConfig): FaceService {
  switch (config.provider) {
    case 'aws':
      return new AWSFaceAdapter(config.client, config.db);

    case 'sabaiface':
      // Use PostgresVectorStore by default if not provided
      const vectorStore = config.vectorStore ?? new PostgresVectorStore(config.db);
      return new SabaiFaceAdapter(
        config.faceDetector,
        vectorStore,
        config.db
      );

    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = config;
      throw new Error(`Unknown provider: ${(_exhaustive as any).provider}`);
  }
}

// =============================================================================
// Convenience Factory Functions
// =============================================================================

/**
 * Create AWS face service.
 *
 * @param client - AWS Rekognition client
 * @param db - Database instance
 * @returns AWS FaceService implementation
 */
export function createAWSFaceService(
  client: RekognitionClient,
  db: InternalDatabase
): FaceService {
  return createFaceService({
    provider: 'aws',
    client,
    db,
  });
}

/**
 * Create SabaiFace service with PostgresVectorStore.
 *
 * IMPORTANT: The faceDetector must have models loaded before use.
 * Call `await faceDetector.loadModels()` before passing to this function.
 *
 * @param faceDetector - Face detector instance (models must be loaded)
 * @param db - Database instance
 * @param vectorStore - Optional vector store (defaults to PostgresVectorStore)
 * @returns SabaiFace FaceService implementation
 *
 * @example
 * ```typescript
 * const detector = new FaceDetector({ modelsPath: './models' });
 * await detector.loadModels(); // MUST call this first
 * const service = createSabaiFaceService(detector, db);
 * ```
 */
export function createSabaiFaceService(
  faceDetector: FaceDetector,
  db: InternalDatabase,
  vectorStore?: VectorStore
): FaceService {
  return createFaceService({
    provider: 'sabaiface',
    faceDetector,
    vectorStore,
    db,
  });
}
