import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { photos } from "./photos";
import type { RekognitionFaceRecord, BoundingBox } from "./types";

export const faces = pgTable(
  "faces",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    photoId: text("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "restrict" }),
    rekognitionFaceId: text("rekognition_face_id"), // Face ID from Rekognition (nullable until indexed)
    boundingBox: jsonb("bounding_box").$type<BoundingBox>(), // Quick access to face location
    rekognitionResponse: jsonb("rekognition_response").$type<RekognitionFaceRecord>(), // Full response for model training
    indexedAt: timestamp("indexed_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("faces_photo_id_idx").on(table.photoId)]
);

export type Face = typeof faces.$inferSelect;
export type NewFace = typeof faces.$inferInsert;
