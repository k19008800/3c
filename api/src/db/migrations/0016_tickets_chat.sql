--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tickets" (
  "id" serial PRIMARY KEY NOT NULL,
  "ticket_no" varchar(30) NOT NULL,
  "user_id" integer NOT NULL,
  "title" varchar(200) NOT NULL,
  "category" varchar(30) NOT NULL,
  "priority" varchar(20) DEFAULT 'normal' NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "description" text NOT NULL,
  "attachments" text,
  "assignee_id" integer,
  "tags" text,
  "source" varchar(20) DEFAULT 'user' NOT NULL,
  "first_response_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "closed_by" varchar(20),
  "is_spam" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tickets_ticket_no_unique" ON "tickets" ("ticket_no");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tickets_user" ON "tickets" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tickets_status" ON "tickets" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tickets_assignee" ON "tickets" ("assignee_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tickets_created" ON "tickets" ("created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_replies" (
  "id" serial PRIMARY KEY NOT NULL,
  "ticket_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "is_staff" boolean DEFAULT false NOT NULL,
  "content" text NOT NULL,
  "attachments" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_rep_ticket" ON "ticket_replies" ("ticket_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_satisfaction" (
  "id" serial PRIMARY KEY NOT NULL,
  "ticket_id" integer NOT NULL,
  "rating" integer NOT NULL,
  "comment" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_sat_ticket" ON "ticket_satisfaction" ("ticket_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_operation_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "ticket_id" integer NOT NULL,
  "operator_id" integer,
  "action" varchar(50) NOT NULL,
  "detail" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_op_ticket" ON "ticket_operation_logs" ("ticket_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_tag_defs" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(50) NOT NULL,
  "color" varchar(20) DEFAULT '#6366f1' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ticket_tag_defs_name_unique" ON "ticket_tag_defs" ("name");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "staff_id" integer,
  "status" varchar(20) DEFAULT 'waiting' NOT NULL,
  "category" varchar(30),
  "queue_position" integer,
  "waiting_started_at" timestamp with time zone,
  "staff_assigned_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "closed_by" varchar(20),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_user" ON "chat_sessions" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_staff" ON "chat_sessions" ("staff_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_status" ON "chat_sessions" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "session_id" integer NOT NULL,
  "sender_id" integer NOT NULL,
  "sender_type" varchar(10) NOT NULL,
  "content_type" varchar(20) DEFAULT 'text' NOT NULL,
  "content" text NOT NULL,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_msg_session" ON "chat_messages" ("session_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_presets" (
  "id" serial PRIMARY KEY NOT NULL,
  "type" varchar(20) NOT NULL,
  "title" varchar(100),
  "content" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_preset_type" ON "chat_presets" ("type");
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "closed_by" varchar(20);
