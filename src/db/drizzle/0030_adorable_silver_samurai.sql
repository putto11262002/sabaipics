ALTER TABLE "photographers" ADD COLUMN IF NOT EXISTS "balance_invalidate_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photographers_balance_invalidate_at_idx" ON "photographers" USING btree ("balance_invalidate_at");
--> statement-breakpoint
DROP VIEW IF EXISTS "public"."active_photographers";
--> statement-breakpoint
CREATE VIEW "public"."active_photographers" AS (
  select
    "id",
    "clerk_id",
    "email",
    "name",
    "stripe_customer_id",
    "pdpa_consent_at",
    "balance",
    "balance_invalidate_at",
    "settings",
    "banned_at",
    "deleted_at",
    "created_at"
  from "photographers"
  where "photographers"."deleted_at" IS NULL
);
