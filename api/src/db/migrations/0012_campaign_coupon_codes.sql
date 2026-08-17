CREATE TABLE IF NOT EXISTS "campaign_coupon_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"code" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'unused' NOT NULL,
	"used_by" integer,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_coupon_codes_code_unique" ON "campaign_coupon_codes" ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_campaign_coupon_codes_campaign" ON "campaign_coupon_codes" ("campaign_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_campaign_coupon_codes_status" ON "campaign_coupon_codes" ("status");
