CREATE TABLE "photographers" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"pdpa_consent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photographers_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
CREATE TABLE "credit_packages" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"credits" integer NOT NULL,
	"price_thb" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photographer_id" text NOT NULL,
	"amount" integer NOT NULL,
	"type" text NOT NULL,
	"stripe_session_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photographer_id" text NOT NULL,
	"name" text NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"access_code" text NOT NULL,
	"qr_code_r2_key" text,
	"rekognition_collection_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_access_code_unique" UNIQUE("access_code")
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"r2_key" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"face_count" integer DEFAULT 0,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faces" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photo_id" text NOT NULL,
	"rekognition_face_id" text,
	"bounding_box" jsonb,
	"rekognition_response" jsonb,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photographer_id" text NOT NULL,
	"consent_type" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text
);
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_photographer_id_photographers_id_fk" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_photographer_id_photographers_id_fk" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faces" ADD CONSTRAINT "faces_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_photographer_id_photographers_id_fk" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photographers_clerk_id_idx" ON "photographers" USING btree ("clerk_id");--> statement-breakpoint
CREATE INDEX "credit_ledger_photographer_expires_idx" ON "credit_ledger" USING btree ("photographer_id","expires_at");--> statement-breakpoint
CREATE INDEX "credit_ledger_stripe_session_idx" ON "credit_ledger" USING btree ("stripe_session_id");--> statement-breakpoint
CREATE INDEX "events_photographer_id_idx" ON "events" USING btree ("photographer_id");--> statement-breakpoint
CREATE INDEX "events_access_code_idx" ON "events" USING btree ("access_code");--> statement-breakpoint
CREATE INDEX "photos_event_id_idx" ON "photos" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "photos_status_idx" ON "photos" USING btree ("status");--> statement-breakpoint
CREATE INDEX "faces_photo_id_idx" ON "faces" USING btree ("photo_id");--> statement-breakpoint
CREATE INDEX "consent_records_photographer_id_idx" ON "consent_records" USING btree ("photographer_id");