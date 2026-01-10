import { pgTable, text, index, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { timestamptz, createdAtCol } from "./common";
import { photographers } from "./photographers";

export const events = pgTable(
  "events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    photographerId: uuid("photographer_id")
      .notNull()
      .references(() => photographers.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    startDate: timestamptz("start_date"),
    endDate: timestamptz("end_date"),
    accessCode: text("access_code").notNull().unique(), // 6-char code for QR
    qrCodeR2Key: text("qr_code_r2_key"), // R2 key for generated QR PNG
    rekognitionCollectionId: text("rekognition_collection_id"), // Nullable, created on first upload
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: createdAtCol(),
  },
  (table) => [
    index("events_photographer_id_idx").on(table.photographerId),
    index("events_access_code_idx").on(table.accessCode),
  ]
);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
