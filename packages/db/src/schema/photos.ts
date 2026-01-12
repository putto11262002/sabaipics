import { pgTable, text, integer, boolean, index, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { timestamptz } from "./common";
import { events } from "./events";

// Enum for photo processing status (DBSCHEMA-001)
export const photoStatuses = ["uploading", "indexing", "indexed", "failed"] as const;
export type PhotoStatus = (typeof photoStatuses)[number];

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
    errorMessage: text("error_message"),
    uploadedAt: timestamptz("uploaded_at").defaultNow().notNull(),
  },
  (table) => [
    index("photos_event_id_idx").on(table.eventId),
    index("photos_status_idx").on(table.status),
  ]
);

export type Photo = typeof photos.$inferSelect;
export type NewPhoto = typeof photos.$inferInsert;
