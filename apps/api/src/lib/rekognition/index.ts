/**
 * Rekognition Integration
 *
 * Re-exports for clean imports:
 * import { indexFacesSafe, AWSRekognitionError } from "../lib/rekognition";
 */

// Client and operations
export {
  createRekognitionClient,
  createCollectionSafe,
  deleteCollectionSafe,
  indexFaces,
  indexFacesSafe,
  getCollectionId,
  toAWSRekognitionError,
  type AWSRekognitionError,
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
} from './client';

// Error helpers and backoff
export {
  isRetryableError,
  isNonRetryableError,
  isThrottlingError,
  getBackoffDelay,
  getThrottleBackoffDelay,
  formatErrorMessage,
} from './errors';
