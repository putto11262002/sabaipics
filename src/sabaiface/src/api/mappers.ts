/**
 * Response Mappers
 *
 * Functions to map domain models to AWS Rekognition response format.
 * Handles normalization of confidence scores (0-1 domain → 0-100 AWS).
 */

import type {
  Face,
  PhotoIndexed,
  SimilarFace,
  BoundingBox as DomainBoundingBox,
} from '../domain/face-service';
import type {
  BoundingBox,
  FaceRecord,
  FaceMatch,
  UnindexedFace,
  IndexFacesResponse,
} from './types';

// =============================================================================
// Bounding Box Conversion
// =============================================================================

/**
 * Convert domain BoundingBox (0-1) to AWS format (0-1, same but uppercase keys).
 *
 * @param box - Domain bounding box
 * @returns AWS bounding box
 */
export function toAWSBoundingBox(box: DomainBoundingBox): BoundingBox {
  return {
    Width: box.width,
    Height: box.height,
    Left: box.left,
    Top: box.top,
  };
}

// =============================================================================
// Face Conversion
// =============================================================================

/**
 * Convert domain Face to AWS FaceRecord format.
 *
 * @param face - Domain face
 * @param externalImageId - Optional external image ID (photo ID)
 * @returns AWS FaceRecord
 */
export function toAWSFaceRecord(face: Face, externalImageId?: string): FaceRecord {
  return {
    Face: {
      FaceId: face.faceId,
      BoundingBox: toAWSBoundingBox(face.boundingBox),
      ExternalImageId: externalImageId || face.externalImageId,
      Confidence: face.confidence * 100, // 0-1 → 0-100
    },
    FaceDetail: {
      BoundingBox: toAWSBoundingBox(face.boundingBox),
      Confidence: face.confidence * 100,
      AgeRange: face.attributes?.age ? {
        Low: face.attributes.age.low ?? 0,
        High: face.attributes.age.high ?? 100,
      } : undefined,
      Gender: face.attributes?.gender ? {
        Value: face.attributes.gender.value === 'male' ? 'Male' : 'Female',
        Confidence: face.attributes.gender.confidence * 100,
      } : undefined,
      Emotions: face.attributes?.emotions?.map(emotion => ({
        Type: emotion.type.toUpperCase(),
        Confidence: emotion.confidence * 100,
      })),
    },
  };
}

// =============================================================================
// Similar Face Conversion
// =============================================================================

/**
 * Convert domain SimilarFace to AWS FaceMatch format.
 *
 * @param similarFace - Domain similar face
 * @returns AWS FaceMatch
 */
export function toAWSFaceMatch(similarFace: SimilarFace): FaceMatch {
  return {
    Similarity: similarFace.similarity * 100, // 0-1 → 0-100
    Face: {
      FaceId: similarFace.faceId,
      BoundingBox: similarFace.boundingBox ? toAWSBoundingBox(similarFace.boundingBox) : {
        Width: 0,
        Height: 0,
        Left: 0,
        Top: 0,
      },
      ExternalImageId: similarFace.externalImageId,
      Confidence: (similarFace.confidence ?? 1.0) * 100,
    },
  };
}

// =============================================================================
// PhotoIndexed Conversion
// =============================================================================

/**
 * Convert domain PhotoIndexed to AWS IndexFaces response.
 *
 * @param result - Domain photo indexed result
 * @param externalImageId - Optional external image ID
 * @returns AWS IndexFaces response
 */
export function toAWSIndexFacesResponse(
  result: PhotoIndexed,
  externalImageId?: string
): IndexFacesResponse {
  return {
    FaceRecords: result.faces.map(face => toAWSFaceRecord(face, externalImageId)),
    UnindexedFaces: result.unindexedFaces.map(uf => ({
      FaceDetail: uf.faceDetail?.boundingBox ? {
        BoundingBox: toAWSBoundingBox(uf.faceDetail.boundingBox),
      } : undefined,
      Reasons: uf.reasons ?? ['UNKNOWN'],
    })),
    FaceModelVersion: result.provider === 'aws'
      ? result.modelVersion ?? 'aws-rekognition-6.0'
      : 'face-api.js-1.7.15',
  };
}
