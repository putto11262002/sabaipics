import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { photographers } from "./photographers";

export const events = pgTable(
  "events",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    photographerId: text("photographer_id")
      .notNull()
      .references(() => photographers.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    startDate: timestamp("start_date", { mode: "string", withTimezone: true }),
    endDate: timestamp("end_date", { mode: "string", withTimezone: true }),
    accessCode: text("access_code").notNull().unique(), // 6-char code for QR
    qrCodeR2Key: text("qr_code_r2_key"), // R2 key for generated QR PNG
    rekognitionCollectionId: text("rekognition_collection_id"), // Nullable, created on first upload
    expiresAt: timestamp("expires_at", { mode: "string", withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("events_photographer_id_idx").on(table.photographerId),
    index("events_access_code_idx").on(table.accessCode),
  ]
);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
