CREATE TABLE IF NOT EXISTS "user_webhooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"url" varchar(500) NOT NULL,
	"secret" varchar(100) NOT NULL,
	"events" jsonb NOT NULL,
	"balance_threshold" integer,
	"usage_spike_multiplier" integer,
	"failure_rate_threshold" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_sent_at" timestamp,
	"last_status" varchar(20),
	"last_response_code" integer,
	"last_failed_reason" varchar(200),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_webhooks" ADD CONSTRAINT "user_webhooks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webhooks_user_enabled" ON "user_webhooks" ("user_id","enabled");
