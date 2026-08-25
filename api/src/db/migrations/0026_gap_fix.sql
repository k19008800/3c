-- 原型差距补齐（2026-08-18）：公告已读 / 退款申请 / 跟进提醒 / 客户标签 / 联系记录 / 客服测试Key / 知识库反馈
-- 对齐前端已挂载页面契约（AdminAnnouncementsPage / AdminRefundReviewPage / Sales* / AdminSupportPage / HelpCenterPage）

CREATE TABLE IF NOT EXISTS "announcement_reads" (
	"announcement_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"read_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_reads_announcement_id_user_id_pk" PRIMARY KEY ("announcement_id","user_id")
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_announcement_reads_user" ON "announcement_reads" ("user_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "refund_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"amount" numeric(18, 8) NOT NULL,
	"reason" text,
	"order_no" varchar(100),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_refund_requests_status" ON "refund_requests" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_refund_requests_user" ON "refund_requests" ("user_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "follow_reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"sales_user_id" integer NOT NULL,
	"customer_user_id" integer NOT NULL,
	"content" text,
	"remind_at" timestamp,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_follow_reminders_sales" ON "follow_reminders" ("sales_user_id","status");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "customer_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"sales_user_id" integer NOT NULL,
	"customer_user_id" integer NOT NULL,
	"tag" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_customer_tags_sales_customer_tag" ON "customer_tags" ("sales_user_id","customer_user_id","tag");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "customer_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"sales_user_id" integer NOT NULL,
	"customer_user_id" integer NOT NULL,
	"channel" varchar(20) DEFAULT 'other',
	"content" text NOT NULL,
	"next_follow_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_customer_notes_customer" ON "customer_notes" ("customer_user_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "support_test_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"key_prefix" varchar(20) NOT NULL,
	"key_hash" varchar(200) NOT NULL,
	"associated_user_id" integer,
	"expires_at" timestamp NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_support_test_keys_created" ON "support_test_keys" ("created_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "knowledge_base_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"user_id" integer,
	"helpful" boolean DEFAULT true NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_kb_feedback_article" ON "knowledge_base_feedback" ("article_id");--> statement-breakpoint

-- 业务员角色（role=sales）：扩展 user_role 枚举（2026-08-18，对齐 ConsoleLayout isSales）
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'sales';--> statement-breakpoint
