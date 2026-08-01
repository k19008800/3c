--> statement-breakpoint
-- 迁移 0019: 代理商体系「后台主导版」(报备划拨制)
-- 对齐 PRD-代理商体系-后台主导版.md + SPEC-代理商后台主导版.md
-- 1. agent_profiles 新增 created_by_admin_id（记录后台创建操作人）
-- 2. agent_profiles 移除 parent_user_id（单级化，去掉多级分销）
-- 3. 新建 agent_customer_bindings（客户归属绑定）
-- 4. 新建 agent_report_requests（报备审核队列）
-- 5. 新建 agent_binding_logs（归属变更审计日志）
--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD COLUMN IF NOT EXISTS "created_by_admin_id" integer;
--> statement-breakpoint
-- 单级化：移除多级分销字段 parent_user_id（D1）
ALTER TABLE "agent_profiles" DROP COLUMN IF EXISTS "parent_user_id";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_customer_bindings" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_user_id" integer NOT NULL,
	"customer_user_id" integer NOT NULL,
	"status" varchar(20) NOT NULL DEFAULT 'active',
	"bound_at" timestamp with time zone NOT NULL DEFAULT now(),
	"unbound_at" timestamp with time zone,
	"operator_id" integer,
	"reason" varchar(500),
	CONSTRAINT "acb_customer_unique_active" UNIQUE("customer_user_id","status")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_report_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_user_id" integer NOT NULL,
	"target_phone" varchar(32),
	"target_email" varchar(255),
	"target_user_id" integer,
	"note" varchar(500),
	"status" varchar(20) NOT NULL DEFAULT 'pending',
	"audit_operator_id" integer,
	"audit_at" timestamp with time zone,
	"reject_reason" varchar(500),
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "arr_target_check" CHECK (
		(target_phone IS NOT NULL) OR (target_email IS NOT NULL) OR (target_user_id IS NOT NULL)
	)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_binding_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_user_id" integer NOT NULL,
	"from_agent_user_id" integer,
	"to_agent_user_id" integer,
	"action" varchar(20) NOT NULL,
	"operator_id" integer,
	"reason" varchar(500),
	"created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_customer_bindings" ADD CONSTRAINT "acb_agent_user_fk" FOREIGN KEY ("agent_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_customer_bindings" ADD CONSTRAINT "acb_customer_user_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_report_requests" ADD CONSTRAINT "arr_agent_user_fk" FOREIGN KEY ("agent_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_binding_logs" ADD CONSTRAINT "abl_customer_user_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_acb_agent" ON "agent_customer_bindings" USING btree ("agent_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_acb_customer" ON "agent_customer_bindings" USING btree ("customer_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_arr_status" ON "agent_report_requests" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_arr_agent" ON "agent_report_requests" USING btree ("agent_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_abl_customer" ON "agent_binding_logs" USING btree ("customer_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_abl_created" ON "agent_binding_logs" USING btree ("created_at");
