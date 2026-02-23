CREATE TABLE "app_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"signup_bonus_enabled" boolean DEFAULT false NOT NULL,
	"signup_bonus_credits" integer DEFAULT 0 NOT NULL,
	"signup_bonus_credit_expires_in_days" integer DEFAULT 180 NOT NULL,
	"updated_at" timestamp with time zone,
	"updated_by" text
);
--> statement-breakpoint
INSERT INTO "app_settings" ("id") VALUES ('global') ON CONFLICT DO NOTHING;
