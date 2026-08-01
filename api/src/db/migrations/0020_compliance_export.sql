--> statement-breakpoint
-- 迁移 0020: 合规法务与成本分析（§33）
-- 对齐 SPEC-§33-合规法务与成本分析.md
-- 1. privacy_policy_versions + user_privacy_consents（33.1 隐私政策版本管理）
-- 2. terms_of_service_versions + user_tos_consents（33.2 服务条款版本管理）
-- 3. data_export_requests + user_export_jobs（33.3 用户数据导出 GDPR）
-- 4. users 新增 consent_status（记录用户对最新协议的确认状态）
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "privacy_policy_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"version" varchar(20) NOT NULL,
	"title" varchar(200),
	"content" text NOT NULL,
	"summary" text,
	"status" varchar(20) NOT NULL DEFAULT 'draft',
	"published_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_privacy_consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"version_id" integer NOT NULL,
	"consented_at" timestamp with time zone NOT NULL DEFAULT now(),
	"ip" varchar(45)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upc_user" ON "user_privacy_consents" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upc_version" ON "user_privacy_consents" ("version_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "terms_of_service_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"version" varchar(20) NOT NULL,
	"title" varchar(200),
	"content" text NOT NULL,
	"summary" text,
	"status" varchar(20) NOT NULL DEFAULT 'draft',
	"published_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_tos_consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"version_id" integer NOT NULL,
	"consented_at" timestamp with time zone NOT NULL DEFAULT now(),
	"ip" varchar(45)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_utc_user" ON "user_tos_consents" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_utc_version" ON "user_tos_consents" ("version_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "data_export_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"requested_at" timestamp with time zone NOT NULL DEFAULT now(),
	"status" varchar(20) NOT NULL DEFAULT 'pending',
	"processed_by" integer,
	"processed_at" timestamp with time zone,
	"file_url" text,
	"file_expires_at" timestamp with time zone,
	"file_size_bytes" bigint,
	"file_count" integer DEFAULT 0,
	"error_message" text,
	"reject_reason" text,
	"retry_count" integer DEFAULT 0,
	"notification_sent" boolean DEFAULT false,
	"deadline" timestamp with time zone,
	"priority" boolean DEFAULT false
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_der_user" ON "data_export_requests" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_der_status" ON "data_export_requests" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_export_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"part_number" integer DEFAULT 1,
	"status" varchar(20) DEFAULT 'pending',
	"file_url" text,
	"file_size_bytes" bigint,
	"data_type" varchar(50),
	"date_range" varchar(50),
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_uej_request" ON "user_export_jobs" ("request_id");
--> statement-breakpoint
-- users 新增：协议确认状态（none=无待确认 / privacy_pending=待确认隐私政策 / tos_pending=待确认服务条款 / both_pending=两者待确认）
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "consent_status" varchar(20) NOT NULL DEFAULT 'none';
