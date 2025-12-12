/**
 * Rekognition Integration
 *
 * Re-exports for clean imports:
 * import { indexFaces, isRetryableError } from "../lib/rekognition";
 */

// Client and operations
export {
  createRekognitionClient,
  createCollection,
  deleteCollection,
  indexFaces,
  getCollectionId,
  type RekognitionEnv,
  type IndexFacesResult,
  // SDK types
  type FaceRecord,
  type UnindexedFace,
  type FaceDetail,
  type Face,
  type BoundingBox,
  type AgeRange,
  type Emotion,
  type Landmark,
  type Pose,
  type ImageQuality,
  type Reason,
} from "./client";

// Error handling
export {
  isRetryableError,
  isNonRetryableError,
  isThrottlingError,
  getBackoffDelay,
  getThrottleBackoffDelay,
  formatErrorMessage,
} from "./errors";
