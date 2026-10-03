-- 0042 用户消费预算熔断：user_budget_settings（§20.1 用户预算熔断后端）
-- 每用户至多一行（user_id 唯一）。未设置记录的用户不做预算熔断（向后兼容）。
-- 金额单位：整数「分」。幂等：CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS。

CREATE TABLE IF NOT EXISTS "user_budget_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "daily_limit_cents" integer,
  "monthly_limit_cents" integer,
  "alert_threshold" integer DEFAULT 80 NOT NULL,
  "hard_block" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_budget_user" ON "user_budget_settings" ("user_id");
