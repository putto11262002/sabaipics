/**
 * Type definitions for Rekognition response data stored in faces table.
 * These mirror the AWS SDK types but are defined locally to avoid
 * adding @aws-sdk/client-rekognition as a dependency to the db package.
 *
 * Full response is stored for model training purposes.
 */

/**
 * Bounding box for a detected face.
 * Values are ratios of the image dimensions (0-1).
 */
export interface BoundingBox {
  Width?: number;
  Height?: number;
  Left?: number;
  Top?: number;
}

/**
 * Age range estimation for a face.
 */
export interface AgeRange {
  Low?: number;
  High?: number;
}

/**
 * Emotion detected on a face with confidence score.
 */
export interface Emotion {
  Type?: string;
  Confidence?: number;
}

/**
 * Facial landmark point (e.g., eye, nose, mouth corners).
 */
export interface Landmark {
  Type?: string;
  X?: number;
  Y?: number;
}

/**
 * Head pose estimation.
 */
export interface Pose {
  Roll?: number;
  Yaw?: number;
  Pitch?: number;
}

/**
 * Image quality metrics.
 */
export interface ImageQuality {
  Brightness?: number;
  Sharpness?: number;
}

/**
 * Detailed attributes for a detected face.
 */
export interface FaceDetail {
  BoundingBox?: BoundingBox;
  AgeRange?: AgeRange;
  Smile?: { Value?: boolean; Confidence?: number };
  Eyeglasses?: { Value?: boolean; Confidence?: number };
  Sunglasses?: { Value?: boolean; Confidence?: number };
  Gender?: { Value?: string; Confidence?: number };
  Beard?: { Value?: boolean; Confidence?: number };
  Mustache?: { Value?: boolean; Confidence?: number };
  EyesOpen?: { Value?: boolean; Confidence?: number };
  MouthOpen?: { Value?: boolean; Confidence?: number };
  Emotions?: Emotion[];
  Landmarks?: Landmark[];
  Pose?: Pose;
  Quality?: ImageQuality;
  Confidence?: number;
  FaceOccluded?: { Value?: boolean; Confidence?: number };
  EyeDirection?: { Yaw?: number; Pitch?: number; Confidence?: number };
}

/**
 * Face metadata stored in Rekognition collection.
 */
export interface RekognitionFace {
  FaceId?: string;
  BoundingBox?: BoundingBox;
  ImageId?: string;
  ExternalImageId?: string;
  Confidence?: number;
  IndexFacesModelVersion?: string;
  UserId?: string;
}

/**
 * Record of an indexed face from Rekognition IndexFaces response.
 * This is the full response we store for model training.
 */
export interface RekognitionFaceRecord {
  Face?: RekognitionFace;
  FaceDetail?: FaceDetail;
}
