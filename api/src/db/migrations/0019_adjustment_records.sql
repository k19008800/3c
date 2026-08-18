-- 手动调账记录（产品裁决 2026-08-15，对齐原型 admin-adjust.html）
CREATE TYPE "public"."adjustment_status" AS ENUM('pending', 'pending_level2', 'approved', 'rejected', 'reversed');--> statement-breakpoint
CREATE TABLE "adjustment_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"direction" varchar(10) NOT NULL,
	"amount" numeric(18, 8) NOT NULL,
	"reason" text NOT NULL,
	"subject" varchar(50) NOT NULL,
	"reference_no" varchar(100),
	"attachment" varchar(255),
	"approval_level" varchar(10) NOT NULL,
	"status" "adjustment_status" DEFAULT 'pending' NOT NULL,
	"balance_before" numeric(18, 8),
	"balance_after" numeric(18, 8),
	"requested_by" integer NOT NULL,
	"approved_by" integer,
	"reviewed_by" integer,
	"reject_reason" text,
	"reversed_by_id" integer,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adjustment_records" ADD CONSTRAINT "adjustment_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id");
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adjustment_records" ADD CONSTRAINT "adjustment_records_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "users"("id");
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adjustment_records" ADD CONSTRAINT "adjustment_records_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "users"("id");
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adjustment_records" ADD CONSTRAINT "adjustment_records_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id");
EXCEPTION WHEN duplicate_object THEN null;
END $$;
