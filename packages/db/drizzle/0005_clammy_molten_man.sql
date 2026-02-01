-- Create view for active (non-deleted) events
-- Application code should query this view instead of the events table directly
-- to automatically filter out soft-deleted events (where deleted_at IS NOT NULL)
CREATE VIEW "public"."active_events" AS
SELECT
  "id",
  "photographer_id",
  "name",
  "subtitle",
  "start_date",
  "end_date",
  "qr_code_r2_key",
  "rekognition_collection_id",
  "slideshow_config",
  "logo_r2_key",
  "expires_at",
  "deleted_at",
  "created_at"
FROM "events"
WHERE "deleted_at" IS NULL;