/**
 * Face Recognition v2
 *
 * Self-hosted InsightFace + pgvector system.
 * Three concerns: extraction (Python), storage (pgvector), search (SQL).
 */

// Extractor factory
export { createExtractor, type ExtractorConfig } from './extractor';

// pgvector search
export { searchByFace } from './search';

// Embedding persistence
export { insertFaceEmbeddings } from './storage';

// Error helpers
export { isRetryable, isThrottle, getErrorName, getBackoffDelay, getThrottleBackoffDelay } from './errors';

// Types
export type {
  BoundingBox,
  DetectedFace,
  ExtractionResult,
  PhotoMatch,
  SearchOptions,
  RecognitionError,
  FaceExtractor,
} from './types';
