/**
 * Face Service Factory
 *
 * Creates SabaiFace service implementations.
 * Handles dependency injection for the SabaiFace adapter.
 */

import type { InternalDatabase } from '../db';
import type { FaceService } from '../domain/face-service';
import { SabaiFaceAdapter } from '../adapters/sabaiface/sabaiface-adapter';
import { PostgresVectorStore } from '../adapters/postgres/postgres-vector-store';
import type { FaceDetector } from '../core/face-detector';
import type { VectorStore } from '../core/vector-store';

// =============================================================================
// Factory Configuration
// =============================================================================

/**
 * Configuration for SabaiFace provider
 */
export interface SabaiFaceProviderConfig {
  provider: 'sabaiface';
  faceDetector: FaceDetector;
  vectorStore?: VectorStore; // Optional - will default to PostgresVectorStore
  db: InternalDatabase;
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a SabaiFace FaceService instance.
 *
 * @param config - SabaiFace provider configuration
 * @returns SabaiFace FaceService implementation
 *
 * @example
 * ```typescript
 * const sabaiFaceService = createFaceService({
 *   provider: 'sabaiface',
 *   faceDetector: detector,
 *   vectorStore: store,
 *   db: database,
 * });
 * ```
 */
export function createFaceService(config: SabaiFaceProviderConfig): FaceService {
  // Use PostgresVectorStore by default if not provided
  const vectorStore = config.vectorStore ?? new PostgresVectorStore(config.db);
  return new SabaiFaceAdapter(
    config.faceDetector,
    vectorStore,
    config.db
  );
}

// =============================================================================
// Convenience Factory Functions
// =============================================================================

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
