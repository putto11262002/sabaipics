-- Rename error_message to error_name for better error tracking
-- We now store the AWS error name (e.g., "ThrottlingException") instead of the message

ALTER TABLE "photos" DROP COLUMN IF EXISTS "error_message";

ALTER TABLE "photos" ADD COLUMN "error_name" text;
