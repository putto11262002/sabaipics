CREATE TABLE "desktop_auth_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"clerk_user_id" text NOT NULL,
	"device_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "desktop_auth_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "desktop_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"refresh_token_hash_prev" text,
	"refresh_token_prev_expires_at" timestamp with time zone,
	"device_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "desktop_sessions_refresh_token_hash_unique" UNIQUE("refresh_token_hash")
);
--> statement-breakpoint
CREATE INDEX "desktop_auth_codes_clerk_user_id_idx" ON "desktop_auth_codes" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "desktop_auth_codes_expires_at_idx" ON "desktop_auth_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "desktop_sessions_clerk_user_id_idx" ON "desktop_sessions" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "desktop_sessions_expires_at_idx" ON "desktop_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "desktop_sessions_revoked_at_idx" ON "desktop_sessions" USING btree ("revoked_at");