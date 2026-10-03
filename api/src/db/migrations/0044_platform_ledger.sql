-- 0044 平台总账 platform_ledger（PRD §29.1）
-- 复式记账：每笔业务成对写入借/贷两行，会计恒等式 SUM(debit)=SUM(credit)。
-- 金额单位：分（bigint），与 balance_transactions 的元换算 cents=round(yuan*100)。
-- 幂等：CREATE TABLE IF NOT EXISTS。

CREATE TABLE IF NOT EXISTS "platform_ledger" (
  "id" serial PRIMARY KEY NOT NULL,
  "entry_date" timestamp with time zone DEFAULT now() NOT NULL,
  "account" text NOT NULL,
  "direction" text NOT NULL,
  "amount_cents" bigint NOT NULL,
  "currency" text DEFAULT 'CNY' NOT NULL,
  "ref_type" text NOT NULL,
  "ref_id" integer,
  "user_id" integer,
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_platform_ledger_account" ON "platform_ledger" ("account");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_platform_ledger_entry_date" ON "platform_ledger" ("entry_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_platform_ledger_user" ON "platform_ledger" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_platform_ledger_ref" ON "platform_ledger" ("ref_type", "ref_id");
