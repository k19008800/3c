CREATE TABLE IF NOT EXISTS "i18n_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(200) NOT NULL,
	"lang" varchar(10) DEFAULT 'zh-CN' NOT NULL,
	"value" text NOT NULL,
	"scope" varchar(50) DEFAULT 'portal' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "i18n_entries" ADD CONSTRAINT "i18n_entries_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_i18n_key_lang_unique" ON "i18n_entries" ("key","lang");
