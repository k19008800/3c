CREATE TABLE IF NOT EXISTS "vendor_settlements" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"period" varchar(7) NOT NULL,
	"total_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_settlements" ADD CONSTRAINT "vendor_settlements_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id");
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_vendor_settlements_supplier_period" ON "vendor_settlements" ("supplier_id","period");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vendor_settlements_period" ON "vendor_settlements" ("period");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vendor_settlements_status" ON "vendor_settlements" ("status");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_settlement_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"settlement_id" integer NOT NULL,
	"model_name" varchar(200) NOT NULL,
	"call_count" integer DEFAULT 0 NOT NULL,
	"cost" numeric(18, 4) DEFAULT '0' NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_settlement_items" ADD CONSTRAINT "vendor_settlement_items_settlement_id_vendor_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "vendor_settlements"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vendor_settlement_items_settlement_id" ON "vendor_settlement_items" ("settlement_id");
