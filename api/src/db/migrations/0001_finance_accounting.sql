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
CREATE UNIQUE INDEX IF NOT EXISTS "accounting_periods_period_unique" ON "accounting_periods" ("period");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ap_status" ON "accounting_periods" ("status");
