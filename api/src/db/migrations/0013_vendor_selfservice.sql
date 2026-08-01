--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "contact_email" varchar(255);
--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "password_hash" varchar(255);
--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "contact_name" varchar(100);
--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "contact_phone" varchar(20);
--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "api_auth_type" varchar(20) DEFAULT 'bearer_token';
--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "reject_reason" text;
--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "reviewed_by" integer;
--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "commission_rate" numeric(5, 4) DEFAULT '0.1000';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_vendors_contact_email" ON "vendors" USING btree ("contact_email");
