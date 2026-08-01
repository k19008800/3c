--> statement-breakpoint
-- 迁移 0005: 发票模块
CREATE TABLE IF NOT EXISTS "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"invoice_no" varchar(64),
	"amount" numeric(18, 2) NOT NULL,
	"tax_rate" numeric(5, 2) NOT NULL DEFAULT '13',
	"tax_amount" numeric(18, 2),
	"total_amount" numeric(18, 2),
	"type" varchar(20) NOT NULL DEFAULT 'ordinary',
	"status" varchar(20) NOT NULL DEFAULT 'pending',
	"title" varchar(200) NOT NULL,
	"tax_no" varchar(50),
	"address" varchar(200),
	"bank_account" varchar(200),
	"email" varchar(100),
	"remark" varchar(500),
	"reject_reason" varchar(500),
	"issued_by" integer,
	"issued_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inv_user" ON "invoices" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inv_status" ON "invoices" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inv_created" ON "invoices" USING btree ("created_at");
