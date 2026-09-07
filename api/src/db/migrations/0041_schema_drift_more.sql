-- 0041 schema 漂移修复：补 4 张 schema 有但迁移从未创建的表
--   quota_exception_rules / quota_exception_history（客户额度例外，admin-credit）
--   real_name_records / real_name_invites（实名认证，admin-verification）
-- 背景：schema 定义存在，但任何迁移 SQL 均未建表（本地经 db:push 生成，生产按迁移建库缺失）
-- 幂等：CREATE TABLE IF NOT EXISTS。

CREATE TABLE IF NOT EXISTS "quota_exception_rules" (
  "id" serial PRIMARY KEY NOT NULL,
  "customer_id" integer NOT NULL,
  "model_name" varchar(100) NOT NULL,
  "rpm" integer,
  "tpm" integer,
  "period" varchar(20) DEFAULT 'forever' NOT NULL,
  "start_date" date,
  "end_date" date,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "reason" text,
  "created_by" integer,
  "updated_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_qer_customer" ON "quota_exception_rules" ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_qer_customer_model" ON "quota_exception_rules" ("customer_id", "model_name");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "quota_exception_history" (
  "id" serial PRIMARY KEY NOT NULL,
  "rule_id" integer NOT NULL REFERENCES "quota_exception_rules"("id") ON DELETE CASCADE,
  "op" varchar(20) NOT NULL,
  "operator_id" integer,
  "before_rpm" integer,
  "before_tpm" integer,
  "after_rpm" integer,
  "after_tpm" integer,
  "note" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_qeh_rule" ON "quota_exception_history" ("rule_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "real_name_records" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "type" varchar(20) DEFAULT 'individual' NOT NULL,
  "real_name" varchar(100) NOT NULL,
  "id_number" varchar(50) NOT NULL,
  "phone" varchar(20),
  "legal_person" varchar(50),
  "company_address" varchar(200),
  "status" varchar(20) DEFAULT 'pending_review' NOT NULL,
  "reviewer_id" integer,
  "reviewed_at" timestamptz,
  "reject_reason" varchar(500),
  "approved_via" varchar(20),
  "direct_note" text,
  "sim_score" numeric(4, 3),
  "risk" jsonb,
  "ocr_fields" jsonb,
  "images" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_rnr_user" ON "real_name_records" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rnr_status" ON "real_name_records" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rnr_status_created" ON "real_name_records" ("status", "created_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "real_name_invites" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "channel" varchar(20) DEFAULT 'email' NOT NULL,
  "sent_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_rni_user" ON "real_name_invites" ("user_id");--> statement-breakpoint
