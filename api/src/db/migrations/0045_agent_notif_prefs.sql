-- 0045 代理商通知偏好 agent_notif_prefs（AgentSettingsPage 通知偏好）
-- 每用户一行，prefs 为 jsonb（key: boolean）。幂等：CREATE TABLE IF NOT EXISTS。

CREATE TABLE IF NOT EXISTS "agent_notif_prefs" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL UNIQUE,
  "prefs" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_agent_notif_prefs_user" ON "agent_notif_prefs" ("user_id");
