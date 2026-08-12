CREATE TABLE IF NOT EXISTS "agent_bank_accounts" (
  "id" serial PRIMARY KEY NOT NULL,
  "agent_id" integer NOT NULL REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action,
  "bank_name" varchar(100) NOT NULL,
  "account_number" varchar(50) NOT NULL,
  "account_holder" varchar(100) NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_bank_accounts_agent_id_idx" ON "agent_bank_accounts" ("agent_id");
--> statement-breakpoint
-- 幂等：每笔消费最多生成一条佣金（Postgres 唯一索引中 NULL 彼此不冲突）
CREATE UNIQUE INDEX IF NOT EXISTS "agent_commissions_consumption_record_id_idx" ON "agent_commissions" ("consumption_record_id");
