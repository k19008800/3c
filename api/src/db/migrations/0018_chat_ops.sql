--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_chat_status" (
  "id" serial PRIMARY KEY NOT NULL,
  "staff_id" integer NOT NULL,
  "status" varchar(20) DEFAULT 'offline' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uk_staff_status" ON "staff_chat_status" ("staff_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_feedback" (
  "id" serial PRIMARY KEY NOT NULL,
  "session_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "rating" integer NOT NULL,
  "comment" varchar(500),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_fb_session" ON "chat_feedback" ("session_id");
