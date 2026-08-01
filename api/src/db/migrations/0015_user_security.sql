--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "two_factor_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "two_factor_secret" varchar(200);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "two_factor_verified" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "two_factor_enabled_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "two_factor_locked_until" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "two_factor_failed_attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_budget_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "monthly_budget" numeric(18, 2) DEFAULT '0' NOT NULL,
  "daily_budget" numeric(18, 2) DEFAULT '0' NOT NULL,
  "budget_type" varchar(10) DEFAULT 'hard' NOT NULL,
  "alert_thresholds" varchar(50) DEFAULT '80' NOT NULL,
  "exempt_keys" text DEFAULT '' NOT NULL,
  "auto_block" boolean DEFAULT true NOT NULL,
  "current_month_spent" numeric(18, 4) DEFAULT '0' NOT NULL,
  "current_day_spent" numeric(18, 4) DEFAULT '0' NOT NULL,
  "period_start" date,
  "blocked" boolean DEFAULT false NOT NULL,
  "blocked_at" timestamp with time zone,
  "last_alerted_at" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uk_user_budget" ON "user_budget_settings" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "budget_alert_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "budget_settings_id" integer NOT NULL,
  "threshold" integer NOT NULL,
  "current_spent" numeric(18, 4),
  "monthly_budget" numeric(18, 2),
  "alert_channel" varchar(20) DEFAULT 'both' NOT NULL,
  "alerted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_budget_alert_user" ON "budget_alert_logs" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "budget_block_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "budget_settings_id" integer NOT NULL,
  "action" varchar(20) NOT NULL,
  "reason" text,
  "operator_id" integer,
  "previous_monthly_budget" numeric(18, 2),
  "new_monthly_budget" numeric(18, 2),
  "operated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_budget_block_user" ON "budget_block_logs" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_recovery_codes" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "code" varchar(120) NOT NULL,
  "used" boolean DEFAULT false NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_recovery_code_user" ON "user_recovery_codes" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session_trusted_devices" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "device_fingerprint" varchar(64) NOT NULL,
  "trusted_until" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trusted_device_user" ON "session_trusted_devices" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trusted_device_fp" ON "session_trusted_devices" ("device_fingerprint");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_devices" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "session_id" varchar(64),
  "device_name" varchar(200),
  "device_type" varchar(20),
  "os" varchar(100),
  "browser" varchar(100),
  "user_agent" text,
  "ip" varchar(45),
  "city" varchar(100),
  "country" varchar(100),
  "fingerprint" varchar(64),
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
  "is_current" boolean DEFAULT false NOT NULL,
  "risk_level" varchar(20) DEFAULT 'normal' NOT NULL,
  "risk_rule" varchar(100),
  "is_active" boolean DEFAULT true NOT NULL,
  "logged_out_at" timestamp with time zone,
  "logged_out_by" varchar(20),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_device_user" ON "user_devices" ("user_id", "is_active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_device_fp" ON "user_devices" ("fingerprint");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "key_permission_changes" (
  "id" serial PRIMARY KEY NOT NULL,
  "key_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "field" varchar(50) NOT NULL,
  "old_value" text,
  "new_value" text,
  "changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kpc_key" ON "key_permission_changes" ("key_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "login_history" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "ip" varchar(45),
  "city" varchar(100),
  "country" varchar(100),
  "device_info" text,
  "user_agent" text,
  "login_at" timestamp with time zone DEFAULT now() NOT NULL,
  "success" boolean DEFAULT true NOT NULL,
  "risk_level" varchar(20) DEFAULT 'normal' NOT NULL,
  "risk_rule" varchar(100),
  "confirmed_by_user" boolean DEFAULT false NOT NULL,
  "confirmed_at" timestamp with time zone,
  "previous_login_city" varchar(100),
  "distance_km" integer,
  "is_blocked" boolean DEFAULT false NOT NULL,
  "block_reason" varchar(200)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_login_user" ON "login_history" ("user_id", "login_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_login_risk" ON "login_history" ("risk_level");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "security_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer,
  "type" varchar(50) NOT NULL,
  "detail" text,
  "ip" varchar(45),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sec_event_user" ON "security_events" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "operation_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer,
  "action" varchar(100) NOT NULL,
  "detail" text,
  "ip" varchar(45),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_oplog_user" ON "operation_logs" ("user_id");
