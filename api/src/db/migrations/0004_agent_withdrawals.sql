--> statement-breakpoint
-- 迁移 0004: 代理提现模块
-- 1. users 增加 pending_balance (提现冻结余额, 分)
-- 2. 新建 agent_withdrawals 表 (双审提现订单)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pending_balance" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_withdrawals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"agent_profile_id" integer,
	"withdrawal_no" varchar(64) NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"account" varchar(64) NOT NULL,
	"bank" varchar(100),
	"account_name" varchar(50),
	"status" varchar(30) NOT NULL DEFAULT 'pending_first_review',
	"first_reviewer_id" integer,
	"first_review_at" timestamp with time zone,
	"first_review_note" varchar(500),
	"second_reviewer_id" integer,
	"second_review_at" timestamp with time zone,
	"second_review_note" varchar(500),
	"reject_reason" varchar(500),
	"transfer_no" varchar(128),
	"transfer_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "agent_withdrawals_withdrawal_no_unique" UNIQUE("withdrawal_no")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_withdrawals" ADD CONSTRAINT "agent_withdrawals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_withdrawals" ADD CONSTRAINT "agent_withdrawals_agent_profile_id_agent_profiles_id_fk" FOREIGN KEY ("agent_profile_id") REFERENCES "public"."agent_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_aw_user" ON "agent_withdrawals" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_aw_status" ON "agent_withdrawals" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_aw_created" ON "agent_withdrawals" USING btree ("created_at");
