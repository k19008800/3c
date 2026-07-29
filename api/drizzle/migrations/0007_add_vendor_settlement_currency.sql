-- Migration: 0007_add_vendor_settlement_currency.sql
-- SPEC-§29.7: 供应商多币种结算配置

ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "settlement_currency" varchar(10) DEFAULT 'CNY';

COMMENT ON COLUMN "vendors"."settlement_currency" IS '结算币种：CNY/USD/HKD/JPY/EUR 等';
