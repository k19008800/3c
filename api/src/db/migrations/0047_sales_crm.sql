-- 0047 CRM 销售漏斗（sales_leads / sales_opportunities / sales_quotes）
-- 对齐 SPEC-§11.2 线索管理 / §11.4 商机与报价管理。幂等：CREATE TABLE IF NOT EXISTS。
-- 金额一律 integer(分)；notes/items 为 jsonb；status/stage 用 varchar（与 gap-fix 既有表一致）。

CREATE TABLE IF NOT EXISTS "sales_leads" (
  "id" serial PRIMARY KEY NOT NULL,
  "company" varchar(200) NOT NULL,
  "contact_name" varchar(100) NOT NULL,
  "contact_email" varchar(255),
  "contact_phone" varchar(50),
  "source" varchar(50) NOT NULL DEFAULT 'other',
  "status" varchar(20) NOT NULL DEFAULT 'new',
  "assigned_to" integer REFERENCES "users"("id"),
  "notes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_sales_leads_assigned" ON "sales_leads" ("assigned_to", "status");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_sales_leads_company" ON "sales_leads" ("company");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sales_opportunities" (
  "id" serial PRIMARY KEY NOT NULL,
  "lead_id" integer REFERENCES "sales_leads"("id"),
  "sales_user_id" integer NOT NULL REFERENCES "users"("id"),
  "name" varchar(200) NOT NULL,
  "expected_value_cents" integer NOT NULL DEFAULT 0,
  "stage" varchar(20) NOT NULL DEFAULT 'proposal',
  "expected_close_date" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_sales_opp_sales_stage" ON "sales_opportunities" ("sales_user_id", "stage");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_sales_opp_lead" ON "sales_opportunities" ("lead_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sales_quotes" (
  "id" serial PRIMARY KEY NOT NULL,
  "opportunity_id" integer NOT NULL REFERENCES "sales_opportunities"("id"),
  "sales_user_id" integer NOT NULL REFERENCES "users"("id"),
  "version" integer NOT NULL DEFAULT 1,
  "items" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "total_cents" integer NOT NULL DEFAULT 0,
  "valid_until" timestamp with time zone,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_sales_quotes_opp" ON "sales_quotes" ("opportunity_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_sales_quotes_sales_status" ON "sales_quotes" ("sales_user_id", "status");
