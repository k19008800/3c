CREATE TABLE "consumption_anomalies" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"anomaly_type" varchar(50) NOT NULL,
	"amount" numeric(18, 8) DEFAULT '0' NOT NULL,
	"severity" varchar(20) DEFAULT 'warning' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"period_key" varchar(20) NOT NULL,
	"detail" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_context_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" varchar(100) NOT NULL,
	"user_id" integer NOT NULL,
	"api_key_id" integer,
	"client_key_hash" varchar(255) NOT NULL,
	"requested_model" varchar(200) NOT NULL,
	"routed_model" varchar(200),
	"supplier_id" integer,
	"supplier_model_id" integer,
	"supplier_key_fp" varchar(64),
	"messages" jsonb NOT NULL,
	"response_text" text,
	"finish_reason" varchar(50),
	"status" varchar(20) NOT NULL,
	"error_code" varchar(50),
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost" numeric(18, 8),
	"client_ip" varchar(50),
	"user_agent" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_context_records_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "model_health_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"bucket_start" timestamp NOT NULL,
	"platform_model" varchar(200) NOT NULL,
	"supplier_id" integer NOT NULL,
	"supplier_model_id" integer,
	"request_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"error_code_dist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"latency_hist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_content" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" varchar(50) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text NOT NULL,
	"status" varchar(20) DEFAULT 'published' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "undo_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"operation_type" varchar(50) NOT NULL,
	"operation_label" varchar(200) NOT NULL,
	"target_type" varchar(50) NOT NULL,
	"target_id" varchar(100) NOT NULL,
	"snapshot" varchar(500) NOT NULL,
	"operator_id" integer,
	"reverted" varchar(20) DEFAULT 'no' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_2fa" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"totp_secret" varchar(255) NOT NULL,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"backup_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_group_memberships" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"description" varchar(255),
	"pricing_group" varchar(50),
	"rate_limit_qps" integer,
	"rate_limit_tpm" integer,
	"daily_quota" numeric(12, 2),
	"model_whitelist" jsonb DEFAULT '[]'::jsonb,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_oauth_bindings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" varchar(30) NOT NULL,
	"open_id" varchar(255) NOT NULL,
	"email" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_retry_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"webhook_url" varchar(500) NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"retry_delay_seconds" integer DEFAULT 60 NOT NULL,
	"backoff_multiplier" integer DEFAULT 2 NOT NULL,
	"enabled" varchar(20) DEFAULT 'true' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consumption_anomalies" ADD CONSTRAINT "consumption_anomalies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_context_records" ADD CONSTRAINT "conversation_context_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_context_records" ADD CONSTRAINT "conversation_context_records_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_context_records" ADD CONSTRAINT "conversation_context_records_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_context_records" ADD CONSTRAINT "conversation_context_records_supplier_model_id_supplier_models_id_fk" FOREIGN KEY ("supplier_model_id") REFERENCES "public"."supplier_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_health_stats" ADD CONSTRAINT "model_health_stats_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_health_stats" ADD CONSTRAINT "model_health_stats_supplier_model_id_supplier_models_id_fk" FOREIGN KEY ("supplier_model_id") REFERENCES "public"."supplier_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_2fa" ADD CONSTRAINT "user_2fa_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_group_memberships" ADD CONSTRAINT "user_group_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_group_memberships" ADD CONSTRAINT "user_group_memberships_group_id_user_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."user_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_oauth_bindings" ADD CONSTRAINT "user_oauth_bindings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consumption_anomalies_user_type_period_uniq" ON "consumption_anomalies" USING btree ("user_id","anomaly_type","period_key");--> statement-breakpoint
CREATE INDEX "idx_ccr_request_id" ON "conversation_context_records" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "idx_ccr_user" ON "conversation_context_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_ccr_status" ON "conversation_context_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ccr_supplier" ON "conversation_context_records" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_ccr_occurred" ON "conversation_context_records" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "idx_ccr_user_occurred" ON "conversation_context_records" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_model_health_bucket" ON "model_health_stats" USING btree ("bucket_start","platform_model","supplier_id");--> statement-breakpoint
CREATE INDEX "idx_mhs_model" ON "model_health_stats" USING btree ("platform_model");--> statement-breakpoint
CREATE INDEX "idx_mhs_bucket" ON "model_health_stats" USING btree ("bucket_start");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_2fa_user_id" ON "user_2fa" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_group_memberships_user_id" ON "user_group_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_groups_name" ON "user_groups" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_oauth_bindings_provider_open_id" ON "user_oauth_bindings" USING btree ("provider","open_id");--> statement-breakpoint
CREATE INDEX "idx_user_oauth_bindings_user_id" ON "user_oauth_bindings" USING btree ("user_id");