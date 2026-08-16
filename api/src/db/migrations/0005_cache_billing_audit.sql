ALTER TABLE "consumption_records" ADD COLUMN "cache_hit_tokens" integer;--> statement-breakpoint
ALTER TABLE "consumption_records" ADD COLUMN "cache_discount" numeric(18, 8);