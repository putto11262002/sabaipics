import { pgTable, text, boolean, integer } from "drizzle-orm/pg-core";
import { timestamptz } from "./common";

export const appSettings = pgTable("app_settings", {
  id: text("id").primaryKey(), // Always 'global'
  signupBonusEnabled: boolean("signup_bonus_enabled").notNull().default(false),
  signupBonusCredits: integer("signup_bonus_credits").notNull().default(0),
  signupBonusCreditExpiresInDays: integer("signup_bonus_credit_expires_in_days")
    .notNull()
    .default(180),
  updatedAt: timestamptz("updated_at"),
  updatedBy: text("updated_by"), // Admin email
});

export type AppSettings = typeof appSettings.$inferSelect;
