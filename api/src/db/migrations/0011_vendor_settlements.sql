--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_settlements" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_id" integer NOT NULL,
	"period" varchar(7) NOT NULL,
	"total_calls" integer NOT NULL DEFAULT 0,
	"success_calls" integer NOT NULL DEFAULT 0,
	"failed_calls" integer NOT NULL DEFAULT 0,
	"total_tokens" bigint NOT NULL DEFAULT 0,
	"total_cost" numeric(18, 4) NOT NULL DEFAULT '0',
	"user_revenue" numeric(18, 4) NOT NULL DEFAULT '0',
	"commission_rate" numeric(5, 4) NOT NULL DEFAULT '0',
	"commission_amount" numeric(18, 4) NOT NULL DEFAULT '0',
	"settlement_amount" numeric(18, 4) NOT NULL DEFAULT '0',
	"status" varchar(20) NOT NULL DEFAULT 'pending',
	"dispute_reason" text,
	"generated_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" integer,
	"paid_at" timestamp with time zone,
	"paid_by" integer,
	"payment_reference" varchar(128),
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uk_vset_vendor_period" ON "vendor_settlements" USING btree ("vendor_id","period");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_settlements" ADD CONSTRAINT "vendor_settlements_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vset_status" ON "vendor_settlements" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vset_vendor" ON "vendor_settlements" USING btree ("vendor_id");
