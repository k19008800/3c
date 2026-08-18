-- 合规域补齐（2026-08-19）：合规策略 + 用户同意记录
-- 对齐原型 admin-consent.html；此前仅有原型无后端表。
-- 策略每次编辑版本号 +1 并写 audit_logs；status: draft | published | revoked。

CREATE TABLE IF NOT EXISTS "consent_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(50) NOT NULL,
	"name" varchar(200) NOT NULL,
	"content" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" varchar(20) DEFAULT 'published' NOT NULL,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "consent_policies_key_unique" ON "consent_policies" ("key");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "consent_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"policy_id" integer NOT NULL,
	"action" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_consent_logs_policy" ON "consent_logs" ("policy_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_consent_logs_user" ON "consent_logs" ("user_id");--> statement-breakpoint

-- 预置两条标准策略（隐私政策 / 服务条款），内容由管理员编辑后发布
INSERT INTO "consent_policies" ("key", "name", "content", "version", "status", "created_at", "updated_at")
VALUES
	('privacy_policy', '隐私政策', '（默认内容，请管理员编辑正文后发布）', 1, 'published', NOW(), NOW()),
	('terms_of_service', '服务条款', '（默认内容，请管理员编辑正文后发布）', 1, 'published', NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;
