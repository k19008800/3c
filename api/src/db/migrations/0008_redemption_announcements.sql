--> statement-breakpoint
-- 迁移 0008: 兑换码系统 + 公告系统
CREATE TABLE IF NOT EXISTS "redemption_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"creator_id" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"total_count" integer NOT NULL DEFAULT 0,
	"used_count" integer NOT NULL DEFAULT 0,
	"expires_at" timestamp with time zone,
	"status" varchar(20) NOT NULL DEFAULT 'active',
	"note" text,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "redemption_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"code" varchar(32) NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"status" varchar(20) NOT NULL DEFAULT 'unused',
	"used_by" integer,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "redemption_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "redemption_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"code_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"batch_id" integer,
	"amount" numeric(18, 4) NOT NULL,
	"code" varchar(32) NOT NULL,
	"created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(500) NOT NULL,
	"content" text NOT NULL,
	"type" varchar(50) NOT NULL DEFAULT 'system_announcement',
	"status" boolean NOT NULL DEFAULT false,
	"priority" integer NOT NULL DEFAULT 0,
	"created_by" integer,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcement_reads" (
	"id" serial PRIMARY KEY NOT NULL,
	"announcement_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"read_at" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "announcement_reads_announcement_id_user_id_unique" UNIQUE("announcement_id","user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "redemption_batches" ADD CONSTRAINT "redemption_batches_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "redemption_codes" ADD CONSTRAINT "redemption_codes_batch_id_redemption_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."redemption_batches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "redemption_logs" ADD CONSTRAINT "redemption_logs_code_id_redemption_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."redemption_codes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "redemption_logs" ADD CONSTRAINT "redemption_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "redemption_logs" ADD CONSTRAINT "redemption_logs_batch_id_redemption_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."redemption_batches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rb_status" ON "redemption_batches" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rb_creator" ON "redemption_batches" USING btree ("creator_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rc_batch" ON "redemption_codes" USING btree ("batch_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rc_status" ON "redemption_codes" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rl_user" ON "redemption_logs" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rl_created" ON "redemption_logs" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ann_status" ON "announcements" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ann_created" ON "announcements" USING btree ("created_at");
