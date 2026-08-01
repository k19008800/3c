--> statement-breakpoint
-- 迁移 0009: 邮件模板 + 营销活动
CREATE TABLE IF NOT EXISTS "email_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"subject_zh" varchar(255) NOT NULL,
	"body_html_zh" text NOT NULL,
	"subject_en" varchar(255),
	"body_html_en" text,
	"description" varchar(255),
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "email_templates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"status" varchar(20) NOT NULL DEFAULT 'draft',
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"auto_end" boolean NOT NULL DEFAULT true,
	"budget_amount" numeric(18, 2) NOT NULL DEFAULT '0',
	"type" varchar(30) NOT NULL DEFAULT 'recharge_gift',
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaign_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"trigger_type" varchar(30) NOT NULL DEFAULT 'recharge',
	"created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaign_participants" ADD CONSTRAINT "campaign_participants_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaign_participants" ADD CONSTRAINT "campaign_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_templates_name" ON "email_templates" USING btree ("name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_camp_status" ON "campaigns" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_camp_created_by" ON "campaigns" USING btree ("created_by");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_camp_start_end" ON "campaigns" USING btree ("start_at","end_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cp_campaign" ON "campaign_participants" USING btree ("campaign_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cp_user" ON "campaign_participants" USING btree ("user_id");
