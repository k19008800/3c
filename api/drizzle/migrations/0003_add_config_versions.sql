-- ============================================================
--  3cloud (3C) — 配置版本控制迁移
--  添加 config_versions 表用于配置变更历史追踪
-- ============================================================

-- 创建配置版本历史表
CREATE TABLE IF NOT EXISTS "config_versions" (
  "id" serial PRIMARY KEY NOT NULL,
  "config_key" varchar(100) NOT NULL,
  "config_type" varchar(50) NOT NULL DEFAULT 'system', -- system | security | login_security
  "old_value" text,
  "new_value" text NOT NULL,
  "changed_by" integer REFERENCES "users"("id"),
  "change_reason" text,
  "ip" varchar(45),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- 添加索引
CREATE INDEX IF NOT EXISTS "config_versions_key_idx" ON "config_versions" USING btree ("config_key");
CREATE INDEX IF NOT EXISTS "config_versions_type_idx" ON "config_versions" USING btree ("config_type");
CREATE INDEX IF NOT EXISTS "config_versions_created_at_idx" ON "config_versions" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "config_versions_key_type_time_idx" ON "config_versions" USING btree ("config_key", "config_type", "created_at" DESC);

-- 在系统配置表中添加版本字段
ALTER TABLE "system_configs" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1;
ALTER TABLE "system_configs" ADD COLUMN IF NOT EXISTS "last_version_id" integer REFERENCES "config_versions"("id");

-- 为login_security_configs表添加版本字段（如果该表存在）
-- 注意：login_security_configs表可能在其他迁移中创建
DO $$ 
BEGIN 
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'login_security_configs') THEN
    ALTER TABLE "login_security_configs" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1;
    ALTER TABLE "login_security_configs" ADD COLUMN IF NOT EXISTS "last_version_id" integer REFERENCES "config_versions"("id");
  END IF;
END $$;

-- 创建审批流程相关表（可选，用于配置变更审批）
CREATE TABLE IF NOT EXISTS "config_change_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "config_key" varchar(100) NOT NULL,
  "config_type" varchar(50) NOT NULL DEFAULT 'system',
  "old_value" text,
  "new_value" text NOT NULL,
  "requested_by" integer NOT NULL REFERENCES "users"("id"),
  "request_reason" text NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending', -- pending | approved | rejected | cancelled
  "reviewed_by" integer REFERENCES "users"("id"),
  "review_notes" text,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "config_change_requests_status_idx" ON "config_change_requests" USING btree ("status");
CREATE INDEX IF NOT EXISTS "config_change_requests_requested_by_idx" ON "config_change_requests" USING btree ("requested_by");
CREATE INDEX IF NOT EXISTS "config_change_requests_created_at_idx" ON "config_change_requests" USING btree ("created_at");

-- 创建配置快照表
CREATE TABLE IF NOT EXISTS "config_snapshots" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(100) NOT NULL,
  "description" text,
  "config_type" varchar(50) NOT NULL DEFAULT 'system',
  "config_data" jsonb NOT NULL,
  "created_by" integer REFERENCES "users"("id"),
  "is_active" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "config_snapshots_name_type_unique" UNIQUE("name", "config_type")
);

CREATE INDEX IF NOT EXISTS "config_snapshots_type_idx" ON "config_snapshots" USING btree ("config_type");
CREATE INDEX IF NOT EXISTS "config_snapshots_active_idx" ON "config_snapshots" USING btree ("is_active");

-- 更新审计日志枚举类型，添加配置相关的action
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'audit_action')
    AND enumlabel = 'config_version_rollback'
  ) THEN
    ALTER TYPE "audit_action" ADD VALUE 'config_version_rollback';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'audit_action')
    AND enumlabel = 'config_snapshot_create'
  ) THEN
    ALTER TYPE "audit_action" ADD VALUE 'config_snapshot_create';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'audit_action')
    AND enumlabel = 'config_snapshot_restore'
  ) THEN
    ALTER TYPE "audit_action" ADD VALUE 'config_snapshot_restore';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'audit_action')
    AND enumlabel = 'config_change_approve'
  ) THEN
    ALTER TYPE "audit_action" ADD VALUE 'config_change_approve';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'audit_action')
    AND enumlabel = 'config_change_reject'
  ) THEN
    ALTER TYPE "audit_action" ADD VALUE 'config_change_reject';
  END IF;
END $$;