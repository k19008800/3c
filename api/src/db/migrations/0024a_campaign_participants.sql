-- 营销域补齐（2026-08-19）：活动参与者表 + campaigns 预算字段
-- 对齐原型 admin-campaigns.html；此前仅有原型无后端表。
-- 注：原计划编号 0023，因代理商报备迁移已占用 0023，改用 0024a。

-- campaigns 补充预算字段（前端 Campaign.budget_amount 契约）
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "budget_amount" numeric(18, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint

-- 营销活动参与记录（trigger_type: auto 自动 / manual 手动发放；amount 单位元）
CREATE TABLE IF NOT EXISTS "campaign_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"trigger_type" varchar(20) DEFAULT 'auto' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_campaign_participants_campaign" ON "campaign_participants" ("campaign_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_campaign_participants_user" ON "campaign_participants" ("user_id");
