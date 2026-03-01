CREATE TABLE "auto_edit_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photographer_id" uuid,
	"name" text NOT NULL,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"contrast" real DEFAULT 1 NOT NULL,
	"brightness" real DEFAULT 1 NOT NULL,
	"saturation" real DEFAULT 1 NOT NULL,
	"sharpness" real DEFAULT 1 NOT NULL,
	"auto_contrast" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auto_edit_presets" ADD CONSTRAINT "auto_edit_presets_photographer_id_photographers_id_fk" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auto_edit_presets_photographer_id_idx" ON "auto_edit_presets" USING btree ("photographer_id");--> statement-breakpoint
CREATE INDEX "auto_edit_presets_is_builtin_idx" ON "auto_edit_presets" USING btree ("is_builtin");