-- 内容审核队列表（补齐原型 admin-content-moderation.html，2026-08 新增）
CREATE TABLE IF NOT EXISTS "content_moderation" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"content_type" varchar(50) DEFAULT 'text' NOT NULL,
	"content" text NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"moderator_id" integer,
	"review_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_moderation" ADD CONSTRAINT "content_moderation_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id");
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_moderation" ADD CONSTRAINT "content_moderation_moderator_id_users_id_fk" FOREIGN KEY ("moderator_id") REFERENCES "users"("id");
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_content_moderation_status" ON "content_moderation" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_content_moderation_created_at" ON "content_moderation" ("created_at");
