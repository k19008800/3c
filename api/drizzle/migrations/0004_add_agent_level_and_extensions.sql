-- ============================================================
--  3cloud (3C) — 第3章 代理商体系增强迁移
--  1. agent_level 枚举与字段
--  2. agent_audit_status 枚举
--  3. 提现限制字段
--  4. 高级代理专用字段
-- ============================================================

-- 1. 创建新枚举
DO $$ BEGIN
  CREATE TYPE "public"."agent_level" AS ENUM('preparatory', 'primary', 'advanced', 'sub');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."agent_audit_status" AS ENUM('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. 向 agents 表添加字段
ALTER TABLE "agents"
  ADD COLUMN IF NOT EXISTS "level" "public"."agent_level" NOT NULL DEFAULT 'preparatory',
  ADD COLUMN IF NOT EXISTS "audit_status" "public"."agent_audit_status" NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS "audit_remark" text,
  ADD COLUMN IF NOT EXISTS "audited_by" integer REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "audited_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "withdraw_cooldown_hours" integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS "withdraw_freeze_days" integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS "account_manager" varchar(128),
  ADD COLUMN IF NOT EXISTS "priority_support" boolean NOT NULL DEFAULT false;

-- 3. 创建索引
CREATE INDEX IF NOT EXISTS "agents_level_idx" ON "agents" USING btree ("level");
CREATE INDEX IF NOT EXISTS "agents_audit_status_idx" ON "agents" USING btree ("audit_status");

-- 4. 更新现有记录默认 level（已有 parentAgentId 的设为 sub，否则设为 primary）
UPDATE "agents" SET "level" = 'sub' WHERE "parent_agent_id" IS NOT NULL AND "level" = 'preparatory';
UPDATE "agents" SET "level" = 'primary' WHERE "parent_agent_id" IS NULL AND "level" = 'preparatory';

-- 5. 添加提现频率检查注释
COMMENT ON COLUMN "agents"."withdraw_cooldown_hours" IS '提现冷却时间（小时），默认24小时（每24小时最多1次）';
COMMENT ON COLUMN "agents"."withdraw_freeze_days" IS '佣金产生后冻结天数，默认7天';
COMMENT ON COLUMN "agents"."level" IS '代理等级: preparatory预备, primary一级, advanced高级, sub子代理';
COMMENT ON COLUMN "agents"."audit_status" IS '审核状态: pending待审, approved通过, rejected拒绝';
COMMENT ON COLUMN "agents"."priority_support" IS '是否优先技术支持（高级代理专属）';
