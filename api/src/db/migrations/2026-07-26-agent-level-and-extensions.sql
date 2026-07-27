-- ============================================================
--  3cloud (3C) — 第3章 代理商体系增强迁移
--  1. agent_level 枚举与字段
--  2. agent_audit_status 枚举
--  3. 提现限制字段
--  4. 高级代理专用字段
-- ============================================================

-- 1. 创建新枚举 (IF NOT EXISTS via type check)
CREATE TYPE "public"."agent_level" AS ENUM('preparatory', 'primary', 'advanced', 'sub');

CREATE TYPE "public"."agent_audit_status" AS ENUM('pending', 'approved', 'rejected');

-- 2. 向 agents 表添加字段（逐个添加避免复杂语法）
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "level" "public"."agent_level" NOT NULL DEFAULT 'preparatory';
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "audit_status" "public"."agent_audit_status" NOT NULL DEFAULT 'approved';
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "audit_remark" text;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "audited_by" integer;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "audited_at" timestamp with time zone;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "withdraw_cooldown_hours" integer NOT NULL DEFAULT 24;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "withdraw_freeze_days" integer NOT NULL DEFAULT 7;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "account_manager" varchar(128);
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "priority_support" boolean NOT NULL DEFAULT false;

-- 3. 创建索引
CREATE INDEX IF NOT EXISTS "agents_level_idx" ON "agents" USING btree ("level");
CREATE INDEX IF NOT EXISTS "agents_audit_status_idx" ON "agents" USING btree ("audit_status");

-- 4. 更新现有记录默认 level（已有 parentAgentId 的设为 sub，否则设为 primary）
UPDATE "agents" SET "level" = 'sub' WHERE "parent_agent_id" IS NOT NULL AND "level" = 'preparatory';
UPDATE "agents" SET "level" = 'primary' WHERE "parent_agent_id" IS NULL AND "level" = 'preparatory';
