DROP INDEX "line_deliveries_search_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "line_deliveries_search_id_unique_idx" ON "line_deliveries" USING btree ("search_id");