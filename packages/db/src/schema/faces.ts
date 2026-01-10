import { pgTable, text, jsonb, index, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { timestamptz } from "./common";
import { photos } from "./photos";

// =============================================================================
// Rekognition Response Types (for JSONB typing per DBSCHEMA-002)
// Defined locally to avoid @aws-sdk/client-rekognition dependency in db package.
// =============================================================================

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

interface AgeRange {
  Low?: number;
  High?: number;
}

interface Emotion {
  Type?: string;
  Confidence?: number;
}

interface Landmark {
  Type?: string;
  X?: number;
  Y?: number;
}

interface Pose {
  Roll?: number;
  Yaw?: number;
  Pitch?: number;
}

interface ImageQuality {
  Brightness?: number;
  Sharpness?: number;
}

interface FaceDetail {
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

interface RekognitionFace {
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
 * Full response stored for model training purposes.
 */
export interface RekognitionFaceRecord {
  Face?: RekognitionFace;
  FaceDetail?: FaceDetail;
}

// =============================================================================
// Faces Table
// =============================================================================

export const faces = pgTable(
  "faces",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    photoId: uuid("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "restrict" }),
    rekognitionFaceId: text("rekognition_face_id"), // Face ID from Rekognition (nullable until indexed)
    boundingBox: jsonb("bounding_box").$type<BoundingBox>(), // Quick access to face location
    rekognitionResponse: jsonb("rekognition_response").$type<RekognitionFaceRecord>(), // Full response for model training
    indexedAt: timestamptz("indexed_at").defaultNow().notNull(),
  },
  (table) => [index("faces_photo_id_idx").on(table.photoId)]
);

export type Face = typeof faces.$inferSelect;
export type NewFace = typeof faces.$inferInsert;
