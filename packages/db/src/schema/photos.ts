import { pgTable, text, integer, boolean, index, uuid, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { timestamptz } from "./common";
import { events } from "./events";

// Enum for photo processing status (DBSCHEMA-001)
export const photoStatuses = ["uploading", "indexing", "indexed", "failed"] as const;
export type PhotoStatus = (typeof photoStatuses)[number];

/** EXIF metadata extracted from original upload before normalization */
export type PhotoExifData = {
  make?: string;
  model?: string;
  lensModel?: string;
  focalLength?: number;
  iso?: number;
  fNumber?: number;
  exposureTime?: number;
  dateTimeOriginal?: string;
  gpsLatitude?: number;
  gpsLongitude?: number;
};

export const photos = pgTable(
  "photos",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    r2Key: text("r2_key").notNull(), // Single normalized JPEG
    status: text("status", { enum: photoStatuses }).notNull().default("uploading"),
    faceCount: integer("face_count").default(0),
    retryable: boolean("retryable"), // null=success, true=retryable, false=non-retryable
    errorName: text("error_name"), // AWS error name (e.g., "ThrottlingException")
    uploadedAt: timestamptz("uploaded_at").defaultNow().notNull(),
    // Normalized image metadata
    width: integer("width"), // pixel width after normalization
    height: integer("height"), // pixel height after normalization
    fileSize: integer("file_size"), // bytes of stored JPEG
    // Original upload metadata
    originalMimeType: text("original_mime_type"), // original upload mime type
    originalFileSize: integer("original_file_size"), // original size before normalization
    // EXIF metadata from original upload
    exif: jsonb("exif").$type<PhotoExifData>(),
    // Indexing timestamp
    indexedAt: timestamptz("indexed_at"), // when indexing completed
    // Soft delete
    deletedAt: timestamptz("deleted_at"), // null = active, set = soft deleted
  },
  (table) => [
    index("photos_event_id_idx").on(table.eventId),
    index("photos_status_idx").on(table.status),
    index("photos_deleted_at_idx").on(table.deletedAt),
  ]
);

export type Photo = typeof photos.$inferSelect;
export type NewPhoto = typeof photos.$inferInsert;
