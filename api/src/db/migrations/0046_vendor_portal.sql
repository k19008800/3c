-- 0046 渠道自助门户（SPEC §25 vendor self-service portal）
-- vendor_accounts：渠道登录账号（一个 supplier 一个登录，email 唯一）
-- vendor_notifications：渠道公告（supplier_id 为空 = 广播全部渠道）
-- vendor_settlement_requests：渠道自助结算申请（§25.4，平台审核后打款）
-- 幂等：CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS。

CREATE TABLE IF NOT EXISTS "vendor_accounts" (
  "id" serial PRIMARY KEY NOT NULL,
  "supplier_id" integer NOT NULL REFERENCES "suppliers" ("id"),
  "email" varchar(255) NOT NULL,
  "password_hash" varchar(255) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "last_login_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_vendor_accounts_email" ON "vendor_accounts" ("email");--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_vendor_accounts_supplier" ON "vendor_accounts" ("supplier_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vendor_notifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "supplier_id" integer REFERENCES "suppliers" ("id"),
  "title" varchar(200) NOT NULL,
  "content" text NOT NULL,
  "category" varchar(30) NOT NULL DEFAULT 'general',
  "priority" varchar(10) NOT NULL DEFAULT 'normal',
  "is_pinned" boolean NOT NULL DEFAULT false,
  "created_by" integer,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_vendor_notifications_supplier" ON "vendor_notifications" ("supplier_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_vendor_notifications_created_at" ON "vendor_notifications" ("created_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vendor_settlement_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "supplier_id" integer NOT NULL REFERENCES "suppliers" ("id"),
  "period" varchar(7),
  "estimated_amount" numeric(18, 4) NOT NULL DEFAULT '0',
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "reject_reason" text,
  "processed_by" integer,
  "processed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_vendor_settlement_requests_supplier" ON "vendor_settlement_requests" ("supplier_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_vendor_settlement_requests_status" ON "vendor_settlement_requests" ("status");
