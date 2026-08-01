--> statement-breakpoint
-- 迁移 0007: 实名认证记录表
CREATE TABLE IF NOT EXISTS "real_name_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" varchar(20) NOT NULL DEFAULT 'individual',
	"real_name" varchar(100) NOT NULL,
	"id_number" varchar(50) NOT NULL,
	"phone" varchar(20),
	"legal_person" varchar(50),
	"company_address" varchar(200),
	"status" varchar(20) NOT NULL DEFAULT 'pending_review',
	"reviewer_id" integer,
	"reviewed_at" timestamp with time zone,
	"reject_reason" varchar(500),
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "real_name_records" ADD CONSTRAINT "real_name_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rnr_user" ON "real_name_records" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rnr_status" ON "real_name_records" USING btree ("status");
