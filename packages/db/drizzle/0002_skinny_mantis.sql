ALTER TABLE "photographers" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
CREATE INDEX "photographers_stripe_customer_id_idx" ON "photographers" USING btree ("stripe_customer_id");--> statement-breakpoint
ALTER TABLE "photographers" ADD CONSTRAINT "photographers_stripe_customer_id_unique" UNIQUE("stripe_customer_id");