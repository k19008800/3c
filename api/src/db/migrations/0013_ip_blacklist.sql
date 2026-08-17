CREATE TABLE IF NOT EXISTS "ip_blacklist" (
	"id" serial PRIMARY KEY NOT NULL,
	"ip" varchar(45) NOT NULL,
	"type" varchar(20) DEFAULT 'single' NOT NULL,
	"reason" varchar(200),
	"source" varchar(50) DEFAULT 'manual' NOT NULL,
	"scope" varchar(20) DEFAULT 'api' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_by" integer,
	"expires_at" timestamp,
	"remark" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ip_blacklist" ADD CONSTRAINT "ip_blacklist_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ip_blacklist_active" ON "ip_blacklist" ("status","expires_at");
