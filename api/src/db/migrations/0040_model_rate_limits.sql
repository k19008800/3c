-- 0040 schema 漂移修复：补 model_rate_limits 表（schema 有、迁移从未创建）
-- 背景：schema/model-rate-limits.ts 定义但任何迁移 SQL 均未建表（本地经 db:push 生成），
--       seed 与额度计算（effective() = min(客户例外, 模型硬顶)）依赖该表 → 42P01。
-- 幂等：CREATE TABLE IF NOT EXISTS。
CREATE TABLE IF NOT EXISTS "model_rate_limits" (
  "id" serial PRIMARY KEY NOT NULL,
  "model_name" varchar(100) NOT NULL,
  "vendor" varchar(50),
  "cap_rpm" integer,
  "cap_tpm" integer,
  "base_rpm" integer,
  "base_tpm" integer,
  "updated_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "model_rate_limits_model_name_unique" UNIQUE("model_name")
);--> statement-breakpoint
