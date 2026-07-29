-- Migration: 0005_add_platform_ledger.sql
-- 创建平台总账（资金流水表）platform_ledger
-- SPEC-§29.1: 记录每一笔资金的进出明细

CREATE TABLE IF NOT EXISTS "platform_ledger" (
  "id" serial PRIMARY KEY,
  "serial_no" varchar(30) NOT NULL UNIQUE,
  "type" varchar(50) NOT NULL,
  "direction" varchar(10) NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "balance_after" numeric(14, 2) NOT NULL,
  "user_id" integer,
  "agent_id" integer,
  "vendor_id" integer,
  "related_order_no" varchar(50),
  "external_ref" varchar(100),
  "payment_channel" varchar(30),
  "status" varchar(20) DEFAULT 'completed',
  "remark" varchar(500),
  "operator_id" integer,
  "reversed_by_serial" varchar(30),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- 索引
CREATE UNIQUE INDEX IF NOT EXISTS "pl_serial_no_idx" ON "platform_ledger" ("serial_no");
CREATE INDEX IF NOT EXISTS "pl_type_idx" ON "platform_ledger" ("type");
CREATE INDEX IF NOT EXISTS "pl_user_id_idx" ON "platform_ledger" ("user_id");
CREATE INDEX IF NOT EXISTS "pl_vendor_id_idx" ON "platform_ledger" ("vendor_id");
CREATE INDEX IF NOT EXISTS "pl_created_at_idx" ON "platform_ledger" ("created_at");

-- 注释
COMMENT ON TABLE "platform_ledger" IS '平台总账：记录每一笔资金的进出明细（SPEC-§29.1）';
COMMENT ON COLUMN "platform_ledger"."serial_no" IS '流水号（唯一）';
COMMENT ON COLUMN "platform_ledger"."type" IS '交易类型：recharge/withdraw/commission/refund/vendor_payout/fee';
COMMENT ON COLUMN "platform_ledger"."direction" IS '方向：in/out';
COMMENT ON COLUMN "platform_ledger"."amount" IS '交易金额（正数）';
COMMENT ON COLUMN "platform_ledger"."balance_after" IS '交易后平台余额';
COMMENT ON COLUMN "platform_ledger"."status" IS '状态：pending/completed/failed/reversed';
