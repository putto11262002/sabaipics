CREATE TABLE "_db_test" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photographers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"stripe_customer_id" text,
	"pdpa_consent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photographers_clerk_id_unique" UNIQUE("clerk_id"),
	CONSTRAINT "photographers_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE "credit_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"credits" integer NOT NULL,
	"price_thb" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photographer_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"type" text NOT NULL,
	"stripe_session_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_ledger_stripe_session_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photographer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"qr_code_r2_key" text,
	"rekognition_collection_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"r2_key" text NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"face_count" integer DEFAULT 0,
	"retryable" boolean,
	"error_name" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"width" integer,
	"height" integer,
	"file_size" integer,
	"original_mime_type" text,
	"original_file_size" integer,
	"indexed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "faces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photo_id" uuid NOT NULL,
	"rekognition_face_id" text,
	"bounding_box" jsonb,
	"rekognition_response" jsonb,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photographer_id" uuid NOT NULL,
	"consent_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text
);
--> statement-breakpoint
CREATE TABLE "upload_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photographer_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"r2_key" text NOT NULL,
	"content_type" text NOT NULL,
	"content_length" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_code" text,
	"error_message" text,
	"photo_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"uploaded_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "upload_intents_r2_key_unique" UNIQUE("r2_key")
);
--> statement-breakpoint
CREATE TABLE "participant_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"selfie_r2_key" text,
	"consent_accepted_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"matched_photo_ids" uuid[],
	"match_count" integer,
	"searched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_photographer_id_photographers_id_fk" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_photographer_id_photographers_id_fk" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faces" ADD CONSTRAINT "faces_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_photographer_id_photographers_id_fk" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_intents" ADD CONSTRAINT "upload_intents_photographer_id_photographers_id_fk" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_intents" ADD CONSTRAINT "upload_intents_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_intents" ADD CONSTRAINT "upload_intents_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_searches" ADD CONSTRAINT "participant_searches_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photographers_clerk_id_idx" ON "photographers" USING btree ("clerk_id");--> statement-breakpoint
CREATE INDEX "photographers_stripe_customer_id_idx" ON "photographers" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "credit_ledger_photographer_expires_idx" ON "credit_ledger" USING btree ("photographer_id","expires_at");--> statement-breakpoint
CREATE INDEX "credit_ledger_stripe_session_idx" ON "credit_ledger" USING btree ("stripe_session_id");--> statement-breakpoint
CREATE INDEX "events_photographer_id_idx" ON "events" USING btree ("photographer_id");--> statement-breakpoint
CREATE INDEX "photos_event_id_idx" ON "photos" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "photos_status_idx" ON "photos" USING btree ("status");--> statement-breakpoint
CREATE INDEX "photos_deleted_at_idx" ON "photos" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "faces_photo_id_idx" ON "faces" USING btree ("photo_id");--> statement-breakpoint
CREATE INDEX "consent_records_photographer_id_idx" ON "consent_records" USING btree ("photographer_id");--> statement-breakpoint
CREATE INDEX "upload_intents_r2_key_idx" ON "upload_intents" USING btree ("r2_key");--> statement-breakpoint
CREATE INDEX "upload_intents_status_expires_idx" ON "upload_intents" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "upload_intents_photographer_idx" ON "upload_intents" USING btree ("photographer_id");--> statement-breakpoint
CREATE INDEX "participant_searches_event_id_idx" ON "participant_searches" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "participant_searches_searched_at_idx" ON "participant_searches" USING btree ("searched_at");