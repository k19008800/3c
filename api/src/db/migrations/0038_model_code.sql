-- # 38 模型编码化改造（PRD/SPEC-模型编码化改造与去除用户供应商选择）
-- 1) supplier_models 增加全局唯一可路由编码列 model_code
-- 2) 默认编码偏好表 user_model_default_codes（本期实现，M-S-08）
-- 注：存量行编码回填由独立脚本 api/scripts/backfill-model-codes.ts 执行（需应用逻辑生成短 code 并去重）。

ALTER TABLE "supplier_models" ADD COLUMN IF NOT EXISTS "model_code" varchar(200);

-- 部分唯一索引：仅约束"有编码"的行唯一，容忍存量行暂未回填（Postgres 普通唯一索引对 NULL 即视为互异）
CREATE UNIQUE INDEX IF NOT EXISTS "uq_supplier_models_model_code"
  ON "supplier_models" ("model_code")
  WHERE "model_code" IS NOT NULL;

-- 默认编码偏好表：用户为「逻辑模型」保存的默认模型编码（本期 M-S-08）
CREATE TABLE IF NOT EXISTS "user_model_default_codes" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "model_name" varchar(200) NOT NULL,
  "model_code" varchar(200) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_model_default_user_model"
  ON "user_model_default_codes" ("user_id", "model_name");
CREATE INDEX IF NOT EXISTS "idx_user_model_default_code"
  ON "user_model_default_codes" ("model_code");