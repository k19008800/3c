--> statement-breakpoint
-- 迁移 0006: 代理佣金结算表
CREATE TABLE IF NOT EXISTS "agent_commissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"billing_log_id" bigint,
	"agent_profile_id" integer,
	"consumption_amount" numeric(18, 4) NOT NULL,
	"rate" numeric(5, 4) NOT NULL,
	"commission_amount" numeric(18, 4) NOT NULL,
	"level" varchar(20),
	"status" varchar(20) NOT NULL DEFAULT 'settled',
	"period_date" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- 唯一约束：同一笔消费对同一代理只计一次佣金
CREATE UNIQUE INDEX IF NOT EXISTS "idx_comm_agent_billing" ON "agent_commissions" USING btree ("agent_id","billing_log_id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_agent_profile_id_agent_profiles_id_fk" FOREIGN KEY ("agent_profile_id") REFERENCES "public"."agent_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_comm_agent" ON "agent_commissions" USING btree ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_comm_agent_created" ON "agent_commissions" USING btree ("agent_id","created_at");
