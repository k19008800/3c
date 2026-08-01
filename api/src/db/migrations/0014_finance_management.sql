--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_ledger" (
  "id" serial PRIMARY KEY NOT NULL,
  "serial_no" varchar(40) NOT NULL,
  "type" varchar(50) NOT NULL,
  "direction" varchar(10) NOT NULL,
  "amount" numeric(18, 4) NOT NULL,
  "balance_after" numeric(18, 4) NOT NULL,
  "user_id" integer,
  "agent_id" integer,
  "vendor_id" integer,
  "related_order_no" varchar(64),
  "external_ref" varchar(128),
  "payment_channel" varchar(30),
  "status" varchar(20) DEFAULT 'completed' NOT NULL,
  "remark" text,
  "operator_id" integer,
  "reversed_by_serial" varchar(40),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_ledger_serial_no_unique" ON "platform_ledger" ("serial_no");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ledger_type" ON "platform_ledger" ("type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ledger_user" ON "platform_ledger" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ledger_vendor" ON "platform_ledger" ("vendor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ledger_created" ON "platform_ledger" ("created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reconciliation_differences" (
  "id" serial PRIMARY KEY NOT NULL,
  "subject_type" varchar(10) NOT NULL,
  "subject_id" integer NOT NULL,
  "period" varchar(10) NOT NULL,
  "platform_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
  "counterparty_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
  "diff_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
  "check_type" varchar(30) DEFAULT 'settlement' NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "resolve_mode" varchar(20),
  "remark" text,
  "resolved_by" integer,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rd_status" ON "reconciliation_differences" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rd_subject" ON "reconciliation_differences" ("subject_type", "subject_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounting_periods" (
  "id" serial PRIMARY KEY NOT NULL,
  "period" varchar(7) NOT NULL,
  "status" varchar(20) DEFAULT 'open' NOT NULL,
  "income_total" numeric(18, 4) DEFAULT '0' NOT NULL,
  "expense_total" numeric(18, 4) DEFAULT '0' NOT NULL,
  "gross_profit" numeric(18, 4) DEFAULT '0' NOT NULL,
  "gross_margin" numeric(18, 4) DEFAULT '0' NOT NULL,
  "locked_by" integer,
  "locked_at" timestamp with time zone,
  "unlocked_by" integer,
  "unlocked_reason" text,
  "unlocked_at" timestamp with time zone,
  "relock_at" timestamp with time zone,
  "voucher_no" varchar(40),
  "check_summary" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uk_ap_period" ON "accounting_periods" ("period");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ap_status" ON "accounting_periods" ("status");
