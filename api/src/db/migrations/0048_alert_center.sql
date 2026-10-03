-- 0048 告警中心（PRD §5.4）：monitoring_rules / alerts / alert_notifications
-- 幂等：CREATE TABLE IF NOT EXISTS，可重复执行。
-- 对齐 ref-5.4-alert-rules.md；alerts.status 状态机 firing → acknowledged → resolved。

CREATE TABLE IF NOT EXISTS "monitoring_rules" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(100) NOT NULL,
  "metric" varchar(50) NOT NULL,
  "threshold" double precision NOT NULL,
  "window_sec" integer NOT NULL DEFAULT 300,
  "channel_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_monitoring_rules_metric" ON "monitoring_rules" ("metric");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_monitoring_rules_enabled" ON "monitoring_rules" ("enabled");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "alerts" (
  "id" serial PRIMARY KEY NOT NULL,
  "rule_id" integer NOT NULL REFERENCES "monitoring_rules"("id"),
  "status" varchar(20) NOT NULL DEFAULT 'firing',
  "metric_value" double precision NOT NULL,
  "threshold" double precision NOT NULL,
  "message" text NOT NULL,
  "fired_at" timestamp with time zone DEFAULT now() NOT NULL,
  "acknowledged_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_alerts_rule" ON "alerts" ("rule_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_alerts_status" ON "alerts" ("status");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_alerts_fired_at" ON "alerts" ("fired_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "alert_notifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "alert_id" integer NOT NULL REFERENCES "alerts"("id"),
  "channel" varchar(20) NOT NULL,
  "recipient" varchar(255) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_alert_notifications_alert" ON "alert_notifications" ("alert_id");
