-- 代理商客户报备审核（2026-08-18 补齐）：原型 admin-agent-customer-approval.html 仅有前端 MOCK，后端无表
-- 报备划拨制：报备 → 后台审核（通过=自动划拨绑定 agent_customers）→ 归属生效（D2，客户归属唯一来源）
-- status: pending(待审核) | approved(已通过-未绑定) | bound(已通过-已绑定) | rejected(已驳回)

CREATE TABLE IF NOT EXISTS "agent_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
	"customer_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"reject_reason" text,
	"note" text,
	"reviewer_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_agent_approvals_status" ON "agent_approvals" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "idx_agent_approvals_pair" ON "agent_approvals" ("agent_id", "customer_id");
