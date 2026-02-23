CREATE TABLE "gift_code_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gift_code_id" uuid NOT NULL,
	"photographer_id" uuid NOT NULL,
	"credits_granted" integer NOT NULL,
	"credit_ledger_entry_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gift_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"credits" integer NOT NULL,
	"description" text,
	"expires_at" timestamp with time zone,
	"credit_expires_in_days" integer DEFAULT 180 NOT NULL,
	"max_redemptions" integer,
	"max_redemptions_per_user" integer DEFAULT 1 NOT NULL,
	"target_photographer_ids" uuid[],
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gift_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "gift_code_redemptions" ADD CONSTRAINT "gift_code_redemptions_gift_code_id_gift_codes_id_fk" FOREIGN KEY ("gift_code_id") REFERENCES "public"."gift_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_code_redemptions" ADD CONSTRAINT "gift_code_redemptions_photographer_id_photographers_id_fk" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_code_redemptions" ADD CONSTRAINT "gift_code_redemptions_credit_ledger_entry_id_credit_ledger_id_fk" FOREIGN KEY ("credit_ledger_entry_id") REFERENCES "public"."credit_ledger"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gift_code_redemptions_code_photographer_idx" ON "gift_code_redemptions" USING btree ("gift_code_id","photographer_id");--> statement-breakpoint
CREATE INDEX "gift_code_redemptions_code_idx" ON "gift_code_redemptions" USING btree ("gift_code_id");--> statement-breakpoint
CREATE INDEX "gift_codes_active_idx" ON "gift_codes" USING btree ("active");