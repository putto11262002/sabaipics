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

// Tunable parameters
export { FACE_SEARCH_MIN_SIMILARITY, FACE_SEARCH_MAX_RESULTS, FACE_SEARCH_EF_SEARCH } from './config';

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
