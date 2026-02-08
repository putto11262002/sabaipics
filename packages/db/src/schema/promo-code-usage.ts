import {
  pgTable,
  text,
  index,
  uuid,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAtCol } from "./common";
import { photographers } from "./photographers";

/**
 * Promo Code Usage Tracking
 *
 * Tracks which photographers have used which promo codes (both gift and discount codes).
 * Enforces "once per customer" rule at the application layer.
 *
 * Use cases:
 * - Public gift codes: Anyone can see/share, but each photographer can only use once
 * - Discount codes: "Once per customer" promotional codes
 */
export const promoCodeUsage = pgTable(
  "promo_code_usage",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    photographerId: uuid("photographer_id")
      .notNull()
      .references(() => photographers.id, { onDelete: "restrict" }),
    promoCode: text("promo_code").notNull(), // Stripe promotion code (e.g., "GIFT-ABC123", "SAVE15")
    stripeSessionId: text("stripe_session_id").notNull(), // Links to credit_ledger for audit trail
    usedAt: createdAtCol(),
  },
  (table) => [
    // Prevent same photographer from using the same code twice
    unique("promo_code_usage_photographer_code_unique").on(
      table.photographerId,
      table.promoCode
    ),
    // Index for fast lookup when checking if code was used
    index("promo_code_usage_photographer_code_idx").on(
      table.photographerId,
      table.promoCode
    ),
    // Index for session lookup (audit trail)
    index("promo_code_usage_session_idx").on(table.stripeSessionId),
  ]
);

export type PromoCodeUsage = typeof promoCodeUsage.$inferSelect;
export type NewPromoCodeUsage = typeof promoCodeUsage.$inferInsert;
