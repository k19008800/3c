-- Migration: 0008_add_global_webhooks.sql
-- SPEC-§32.1: 全局 Webhook 出站

CREATE TABLE IF NOT EXISTS "global_webhooks" (
  "id" serial PRIMARY KEY,
  "name" varchar(100) NOT NULL,
  "url" varchar(500) NOT NULL,
  "secret" varchar(100) NOT NULL,
  "events" text NOT NULL,
  "enabled" boolean DEFAULT true,
  "retry_count" integer DEFAULT 3,
  "consecutive_failures" integer DEFAULT 0,
  "auto_disable_after" integer DEFAULT 10,
  "last_sent_at" timestamp with time zone,
  "last_status" varchar(20),
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
