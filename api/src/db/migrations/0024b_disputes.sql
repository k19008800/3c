-- 争议域补齐（2026-08-19）：消费争议表
-- 对齐原型 admin-dispute.html；此前仅有原型无后端表。
-- 金额单位：分（前端契约 Dispute.amount 展示 amount/100 元）。
-- 状态：pending(待处理) | investigating(调查中) | refunded(已退款) | dismissed(已驳回)

CREATE TABLE IF NOT EXISTS "disputes" (
	"id" serial PRIMARY KEY NOT NULL,
	"dispute_no" varchar(50) NOT NULL,
	"user_id" integer NOT NULL,
	"amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"reason" text NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"handler_id" integer,
	"resolution" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_disputes_status" ON "disputes" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_disputes_user" ON "disputes" ("user_id");
