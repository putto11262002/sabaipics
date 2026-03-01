CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"content" text NOT NULL,
	"tag" text,
	"published_at" timestamp with time zone,
	"active" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "announcements_active_published_idx" ON "announcements" USING btree ("active","published_at");