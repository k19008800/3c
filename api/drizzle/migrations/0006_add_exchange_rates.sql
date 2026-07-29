-- Migration: 0006_add_exchange_rates.sql
-- SPEC-§29.7: 多币种结算汇率管理

-- 1. 汇率主表
CREATE TABLE IF NOT EXISTS "exchange_rates" (
  "id" serial PRIMARY KEY,
  "currency" varchar(10) NOT NULL,
  "rate_to_cny" numeric(14, 6) NOT NULL,
  "source" varchar(20) NOT NULL DEFAULT 'manual',
  "is_active" boolean NOT NULL DEFAULT true,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "er_currency_uk" ON "exchange_rates" ("currency");

-- 2. 汇率历史表
CREATE TABLE IF NOT EXISTS "exchange_rate_history" (
  "id" serial PRIMARY KEY,
  "currency" varchar(10) NOT NULL,
  "rate_to_cny" numeric(14, 6) NOT NULL,
  "source" varchar(20) NOT NULL DEFAULT 'manual',
  "recorded_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "er_history_currency_idx" ON "exchange_rate_history" ("currency");
CREATE INDEX IF NOT EXISTS "er_history_recorded_idx" ON "exchange_rate_history" ("recorded_at");

-- 3. 种子数据（默认汇率）
INSERT INTO "exchange_rates" ("currency", "rate_to_cny", "source") VALUES
  ('USD', '7.250000', 'manual'),
  ('HKD', '0.930000', 'manual'),
  ('JPY', '0.048200', 'manual'),
  ('EUR', '7.860000', 'manual')
ON CONFLICT ("currency") DO NOTHING;

-- 注释
COMMENT ON TABLE "exchange_rates" IS '汇率管理：多币种结算汇率（SPEC-§29.7）';
COMMENT ON TABLE "exchange_rate_history" IS '汇率变更历史';
COMMENT ON COLUMN "exchange_rates"."currency" IS '币种代码 USD/HKD/JPY/EUR';
COMMENT ON COLUMN "exchange_rates"."rate_to_cny" IS '1 本币 = X 人民币';
COMMENT ON COLUMN "exchange_rates"."source" IS '汇率来源：auto 自动获取 / manual 手动';
