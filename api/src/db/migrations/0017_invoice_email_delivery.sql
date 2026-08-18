-- 发票邮件交付模式扩展（产品裁决 2026-08-15）
-- 1) invoice_status 枚举增加 pending / rejected；
-- 2) invoices 表增加 type/税率/税额/价税合计/专票信息/收件邮箱/发送状态 列；
-- 3) invoice_no 允许为空（申请阶段未开票）。

--> statement-breakpoint
ALTER TYPE "public"."invoice_status" ADD VALUE IF NOT EXISTS 'pending';--> statement-breakpoint
ALTER TYPE "public"."invoice_status" ADD VALUE IF NOT EXISTS 'rejected';--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "type" varchar(20) DEFAULT 'ordinary' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "tax_rate" numeric(6, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "tax_amount" numeric(18, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "total_amount" numeric(18, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "reject_reason" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "address" varchar(200);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "phone" varchar(50);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "bank_name" varchar(100);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "bank_account" varchar(100);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "remark" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "email" varchar(255);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "email_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "email_status" varchar(20);--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "invoice_no" DROP NOT NULL;
