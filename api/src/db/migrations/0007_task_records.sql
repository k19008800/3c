CREATE TABLE IF NOT EXISTS "task_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_type" varchar(20) NOT NULL,
	"public_id" varchar(64) NOT NULL,
	"upstream_id" varchar(200),
	"user_id" integer NOT NULL,
	"api_key_id" integer,
	"supplier_id" integer NOT NULL,
	"channel_key_id" integer,
	"action" varchar(50) NOT NULL,
	"model" varchar(100) NOT NULL,
	"prompt" text,
	"status" varchar(20) NOT NULL DEFAULT 'submitted',
	"progress" varchar(10),
	"fail_reason" text,
	"response" jsonb,
	"cost" varchar(30),
	"refunded" boolean NOT NULL DEFAULT false,
	"request_id" varchar(64),
	"submit_time" timestamp,
	"start_time" timestamp,
	"finish_time" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_task_records_public_id" ON "task_records" ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_records_user_id" ON "task_records" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_records_status" ON "task_records" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_records_supplier_id" ON "task_records" ("supplier_id");
