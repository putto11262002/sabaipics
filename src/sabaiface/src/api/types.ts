/**
 * API Types and Validation
 *
 * Zod schemas for AWS Rekognition-compatible request/response validation.
 * All types mirror AWS Rekognition API for drop-in replacement compatibility.
 */

import { z } from 'zod';

// =============================================================================
// Common Types
// =============================================================================

/**
 * Bounding box (AWS format)
 */
export const BoundingBoxSchema = z.object({
  Width: z.number(),
  Height: z.number(),
  Left: z.number(),
  Top: z.number(),
});

export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

// =============================================================================
// CreateCollection
// =============================================================================

export const CreateCollectionRequestSchema = z.object({
  CollectionId: z.string().min(1).max(255),
});

export type CreateCollectionRequest = z.infer<typeof CreateCollectionRequestSchema>;

export const CreateCollectionResponseSchema = z.object({
  StatusCode: z.number(),
  CollectionArn: z.string(),
  FaceModelVersion: z.string(),
});

export type CreateCollectionResponse = z.infer<typeof CreateCollectionResponseSchema>;

// =============================================================================
// IndexFaces
// =============================================================================

export const IndexFacesRequestSchema = z.object({
  CollectionId: z.string().optional(), // Optional since we use URL param
  Image: z
    .object({
      Bytes: z.string(), // Base64 encoded image
    })
    .or(
      z.object({
        S3Object: z.object({
          Bucket: z.string(),
          Name: z.string(),
        }),
      }),
    ),
  ExternalImageId: z.string().optional(),
  DetectionAttributes: z.array(z.enum(['DEFAULT', 'ALL'])).optional(),
  MaxFaces: z.number().min(1).max(100).optional(),
  QualityFilter: z.enum(['NONE', 'AUTO']).optional(),
});

export type IndexFacesRequest = z.infer<typeof IndexFacesRequestSchema>;

export const FaceRecordSchema = z.object({
  Face: z.object({
    FaceId: z.string(),
    BoundingBox: BoundingBoxSchema,
    ImageId: z.string().optional(),
    ExternalImageId: z.string().optional(),
    Confidence: z.number(),
  }),
  FaceDetail: z
    .object({
      BoundingBox: BoundingBoxSchema,
      Confidence: z.number(),
      Landmarks: z.array(z.any()).optional(),
      AgeRange: z
        .object({
          Low: z.number(),
          High: z.number(),
        })
        .optional(),
      Gender: z
        .object({
          Value: z.string(),
          Confidence: z.number(),
        })
        .optional(),
      Emotions: z
        .array(
          z.object({
            Type: z.string(),
            Confidence: z.number(),
          }),
        )
        .optional(),
    })
    .optional(),
});

export type FaceRecord = z.infer<typeof FaceRecordSchema>;

export const UnindexedFaceSchema = z.object({
  FaceDetail: z
    .object({
      BoundingBox: BoundingBoxSchema.optional(),
    })
    .optional(),
  Reasons: z.array(z.string()),
});

export type UnindexedFace = z.infer<typeof UnindexedFaceSchema>;

export const IndexFacesResponseSchema = z.object({
  FaceRecords: z.array(FaceRecordSchema),
  UnindexedFaces: z.array(UnindexedFaceSchema),
  FaceModelVersion: z.string(),
});

export type IndexFacesResponse = z.infer<typeof IndexFacesResponseSchema>;

// =============================================================================
// SearchFacesByImage
// =============================================================================

export const SearchFacesByImageRequestSchema = z.object({
  CollectionId: z.string().optional(), // Optional since it's in the URL path
  Image: z.object({
    Bytes: z.string(), // Base64 encoded
  }),
  MaxFaces: z.number().min(1).max(4096).optional(),
  FaceMatchThreshold: z.number().min(0).max(100).optional(),
});

export type SearchFacesByImageRequest = z.infer<typeof SearchFacesByImageRequestSchema>;

export const FaceMatchSchema = z.object({
  Similarity: z.number(),
  Face: z.object({
    FaceId: z.string(),
    BoundingBox: BoundingBoxSchema,
    ImageId: z.string().optional(),
    ExternalImageId: z.string().optional(),
    Confidence: z.number(),
  }),
});

export type FaceMatch = z.infer<typeof FaceMatchSchema>;

export const SearchFacesByImageResponseSchema = z.object({
  SearchedFaceBoundingBox: BoundingBoxSchema.optional(),
  SearchedFaceConfidence: z.number().optional(),
  FaceMatches: z.array(FaceMatchSchema),
  FaceModelVersion: z.string(),
});

export type SearchFacesByImageResponse = z.infer<typeof SearchFacesByImageResponseSchema>;

// =============================================================================
// DeleteCollection
// =============================================================================

export const DeleteCollectionRequestSchema = z.object({
  CollectionId: z.string(),
});

export type DeleteCollectionRequest = z.infer<typeof DeleteCollectionRequestSchema>;

export const DeleteCollectionResponseSchema = z.object({
  StatusCode: z.number(),
});

export type DeleteCollectionResponse = z.infer<typeof DeleteCollectionResponseSchema>;

// =============================================================================
// Error Response
// =============================================================================

export const ErrorResponseSchema = z.object({
  __type: z.string(),
  message: z.string(),
  Code: z.string().optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
