import { pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { events } from "./events";

// Enum for photo processing status (DBSCHEMA-001)
export const photoStatuses = ["processing", "indexed", "failed"] as const;
export type PhotoStatus = (typeof photoStatuses)[number];

export const photos = pgTable(
  "photos",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    r2Key: text("r2_key").notNull(), // Single normalized JPEG
    status: text("status", { enum: photoStatuses }).notNull().default("processing"),
    faceCount: integer("face_count").default(0),
    uploadedAt: timestamp("uploaded_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("photos_event_id_idx").on(table.eventId),
    index("photos_status_idx").on(table.status),
  ]
);

export type Photo = typeof photos.$inferSelect;
export type NewPhoto = typeof photos.$inferInsert;
