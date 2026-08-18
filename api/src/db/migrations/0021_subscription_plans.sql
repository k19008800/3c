-- 订阅套餐表（补齐原型 admin-subscription.html，2026-08 新增）
-- price 单位：分；quota 为 jsonb 配额明细
CREATE TABLE IF NOT EXISTS "subscription_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(500),
	"price" numeric(18, 2) DEFAULT '0' NOT NULL,
	"quota" jsonb DEFAULT '{}' NOT NULL,
	"billing_cycle" varchar(20) DEFAULT 'monthly' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_subscription_plans_status" ON "subscription_plans" ("status");
