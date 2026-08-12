--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_change_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "supplier_model_id" integer NOT NULL REFERENCES "supplier_models"("id"),
  "vendor_id" integer NOT NULL,
  "old_input_price" numeric(12, 6),
  "new_input_price" numeric(12, 6),
  "old_output_price" numeric(12, 6),
  "new_output_price" numeric(12, 6),
  "old_sale_price" numeric(12, 6),
  "new_sale_price" numeric(12, 6),
  "change_rate" numeric(8, 3) NOT NULL,
  "effective_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reason" varchar(500),
  "operator_id" integer,
  "dispatched" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pcl_model_effective" ON "price_change_logs" ("supplier_model_id", "effective_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pcl_undispatched" ON "price_change_logs" ("effective_at", "dispatched") WHERE "dispatched" = false;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "model_substitutability" (
  "model_id" integer PRIMARY KEY NOT NULL,
  "auto_coefficient" numeric(3, 1) DEFAULT '1.0' NOT NULL,
  "manual_coefficient" numeric(3, 1),
  "manual_reason" varchar(500),
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_notifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "price_change_log_id" integer REFERENCES "price_change_logs"("id"),
  "tier" varchar(1) NOT NULL,
  "impact_score" numeric(6, 2),
  "title" varchar(200),
  "content" text,
  "channel" varchar(20) DEFAULT 'in_app' NOT NULL,
  "sent_at" timestamp with time zone,
  "read_at" timestamp with time zone,
  "is_weekly_summary" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_un_user" ON "user_notifications" ("user_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_un_change" ON "user_notifications" ("price_change_log_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_change_dispatch_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "price_change_log_id" integer NOT NULL REFERENCES "price_change_logs"("id"),
  "total_users_evaluated" integer DEFAULT 0 NOT NULL,
  "tier_a_count" integer DEFAULT 0 NOT NULL,
  "tier_b_count" integer DEFAULT 0 NOT NULL,
  "tier_c_count" integer DEFAULT 0 NOT NULL,
  "dispatched_at" timestamp with time zone DEFAULT now() NOT NULL,
  "error_message" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "to_address" varchar(255) NOT NULL,
  "subject" varchar(300),
  "template_name" varchar(100),
  "content" text,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- email_templates 列对齐前端契约（表为空，直接重建列）
ALTER TABLE "email_templates" DROP COLUMN IF EXISTS "subject";
--> statement-breakpoint
ALTER TABLE "email_templates" DROP COLUMN IF EXISTS "body";
--> statement-breakpoint
ALTER TABLE "email_templates" DROP COLUMN IF EXISTS "variables";
--> statement-breakpoint
ALTER TABLE "email_templates" DROP COLUMN IF EXISTS "language";
--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "subject_zh" varchar(300) NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "subject_en" varchar(300);
--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "body_html_zh" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "body_html_en" text;
--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "description" varchar(300);
