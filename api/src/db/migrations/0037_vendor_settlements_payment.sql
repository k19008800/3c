-- #26 收口：供应商结算单打款/争议字段（paid/dispute 后端端点配套）
-- 状态机扩展：generated → confirmed → paid；generated → disputed → confirmed（解决争议）
ALTER TABLE "vendor_settlements" ADD COLUMN IF NOT EXISTS "paid_at" timestamp;
ALTER TABLE "vendor_settlements" ADD COLUMN IF NOT EXISTS "payment_reference" varchar(200);
ALTER TABLE "vendor_settlements" ADD COLUMN IF NOT EXISTS "dispute_reason" text;
ALTER TABLE "vendor_settlements" ADD COLUMN IF NOT EXISTS "disputed_at" timestamp;
