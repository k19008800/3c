--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"to_address" varchar(255) NOT NULL,
	"subject" varchar(500) NOT NULL,
	"template_name" varchar(100),
	"vars" text,
	"status" varchar(20) NOT NULL DEFAULT 'sent',
	"error" text,
	"message_id" varchar(200),
	"created_by" integer,
	"created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_logs_created" ON "email_logs" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_logs_status" ON "email_logs" USING btree ("status");
