-- 全局 Webhook 订阅配置（产品裁决 2026-08-15，对齐 ref-32 §32.1）
CREATE TABLE IF NOT EXISTS "admin_webhooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"url" varchar(500) NOT NULL,
	"secret" varchar(100) NOT NULL,
	"events" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"retry_count" integer DEFAULT 3 NOT NULL,
	"timeout_ms" integer DEFAULT 5000 NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
