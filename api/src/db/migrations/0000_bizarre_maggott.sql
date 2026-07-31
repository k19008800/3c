CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"username" varchar(50),
	"phone" varchar(20),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"role" varchar(20) DEFAULT 'user' NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"real_name_status" varchar(20) DEFAULT 'unverified',
	"agent_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"key_prefix" varchar(20) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"model_whitelist" text,
	"ip_whitelist" text,
	"domain_whitelist" text,
	"daily_call_limit" integer,
	"daily_token_limit" bigint,
	"daily_cost_limit" integer,
	"expires_at" timestamp,
	"last_used_at" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"base_url" varchar(500),
	"api_format" varchar(20) DEFAULT 'openai',
	"currency" varchar(10) DEFAULT 'CNY',
	"contact" text,
	"health_score" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vendors_name_unique" UNIQUE("name"),
	CONSTRAINT "vendors_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "models" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"display_name" varchar(100),
	"category" varchar(50),
	"context_length" integer DEFAULT 0,
	"description" text,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "models_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_models" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_id" integer NOT NULL,
	"model_id" integer NOT NULL,
	"upstream_model" varchar(200) NOT NULL,
	"cost_input_price" numeric(12, 8) DEFAULT '0' NOT NULL,
	"cost_output_price" numeric(12, 8) DEFAULT '0' NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"health_score" integer DEFAULT 100,
	"avg_latency_ms" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_id" integer NOT NULL,
	"encrypted_key" varchar(500) NOT NULL,
	"key_prefix" varchar(20),
	"is_enabled" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp,
	"failed_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "call_logs" (
	"id" bigint,
	"user_id" integer NOT NULL,
	"api_key_id" integer,
	"model_id" integer,
	"vendor_id" integer,
	"request_id" varchar(64),
	"provider" varchar(100),
	"upstream_model" varchar(200),
	"request_tokens" integer DEFAULT 0,
	"response_tokens" integer DEFAULT 0,
	"total_tokens" integer DEFAULT 0,
	"cost_cents" integer DEFAULT 0,
	"status" varchar(20) DEFAULT 'success' NOT NULL,
	"error_code" varchar(50),
	"error_message" text,
	"latency_ms" integer,
	"fallback_used" varchar(10) DEFAULT 'false',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "call_logs_id_created_at_pk" PRIMARY KEY("id","created_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_logs" (
	"id" bigint,
	"user_id" integer NOT NULL,
	"call_log_id" bigint,
	"price_source" varchar(20),
	"input_price" numeric(18, 6),
	"output_price" numeric(18, 6),
	"discount_rate" numeric(5, 4),
	"estimated_cost" numeric(18, 6),
	"actual_cost" numeric(18, 6),
	"refund_amount" numeric(18, 6),
	"balance_before" integer,
	"balance_after" integer,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_logs_id_created_at_pk" PRIMARY KEY("id","created_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_id" integer NOT NULL,
	"model_qps" integer DEFAULT 2000,
	"model_user_qps" integer DEFAULT 50,
	"model_concurrency" integer DEFAULT 10,
	"max_prompt_tokens" integer,
	"max_completion_tokens" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitoring_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"message" text NOT NULL,
	"value" double precision NOT NULL,
	"threshold" double precision NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"escalated" boolean DEFAULT false NOT NULL,
	"escalation_level" integer DEFAULT 0,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitoring_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"threshold" double precision NOT NULL,
	"severity" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"duration" integer DEFAULT 60,
	"silence_period" integer DEFAULT 300,
	"escalation_enabled" boolean DEFAULT false,
	"escalation_after" integer DEFAULT 3600,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monitoring_rules_type_unique" UNIQUE("type")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "circuit_breaker_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_model_id" integer NOT NULL,
	"failure_threshold" integer DEFAULT 5 NOT NULL,
	"circuit_timeout_sec" integer DEFAULT 30 NOT NULL,
	"probe_count" integer DEFAULT 3 NOT NULL,
	"probe_interval_sec" integer DEFAULT 10 NOT NULL,
	"health_check_enabled" boolean DEFAULT true NOT NULL,
	"health_check_endpoint" varchar(500),
	"health_check_method" varchar(10) DEFAULT 'GET',
	"health_check_interval_sec" integer DEFAULT 30,
	"health_check_timeout_ms" integer DEFAULT 5000,
	"scope" varchar(20) DEFAULT 'vendor_model' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "routing_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_id" integer NOT NULL,
	"vendor_id" integer NOT NULL,
	"override_type" varchar(20) DEFAULT 'vendor' NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"is_permanent" boolean DEFAULT false NOT NULL,
	"reason" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "routing_recommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_id" integer NOT NULL,
	"vendor_id" integer NOT NULL,
	"upstream_model_name" varchar(200),
	"cost_score" integer NOT NULL,
	"latency_score" integer NOT NULL,
	"reliability_score" integer NOT NULL,
	"overall_score" integer NOT NULL,
	"avg_cost_per_call" numeric(12, 6),
	"avg_latency_ms" numeric(10, 2),
	"success_rate" numeric(5, 2),
	"total_calls" integer DEFAULT 0,
	"calc_period" varchar(10) DEFAULT '7d',
	"reason" text,
	"analyzed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_models" ADD CONSTRAINT "vendor_models_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_models" ADD CONSTRAINT "vendor_models_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_api_keys" ADD CONSTRAINT "vendor_api_keys_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_logs" ADD CONSTRAINT "billing_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rate_limits" ADD CONSTRAINT "rate_limits_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "circuit_breaker_configs" ADD CONSTRAINT "circuit_breaker_configs_vendor_model_id_vendor_models_id_fk" FOREIGN KEY ("vendor_model_id") REFERENCES "public"."vendor_models"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "routing_overrides" ADD CONSTRAINT "routing_overrides_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "routing_overrides" ADD CONSTRAINT "routing_overrides_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "routing_overrides" ADD CONSTRAINT "routing_overrides_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "routing_recommendations" ADD CONSTRAINT "routing_recommendations_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "routing_recommendations" ADD CONSTRAINT "routing_recommendations_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_api_keys_user" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_api_keys_hash" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vendors_status" ON "vendors" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_models_status" ON "models" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vendor_models_model" ON "vendor_models" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vendor_models_vendor" ON "vendor_models" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vendor_api_keys_vendor" ON "vendor_api_keys" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_billing_call_log" ON "billing_logs" USING btree ("call_log_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_billing_user_created" ON "billing_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rate_limits_model_id_idx" ON "rate_limits" USING btree ("model_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "circuit_config_vendor_model_idx" ON "circuit_breaker_configs" USING btree ("vendor_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "routing_override_model_idx" ON "routing_overrides" USING btree ("model_id");