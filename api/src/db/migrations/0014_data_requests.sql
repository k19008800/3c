CREATE TABLE IF NOT EXISTS "data_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"request_type" varchar(50) DEFAULT 'data_export' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"data_scope" varchar(100) DEFAULT 'all' NOT NULL,
	"reason" text,
	"admin_id" integer,
	"admin_note" text,
	"file_path" varchar(500),
	"file_expires_at" timestamp,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
