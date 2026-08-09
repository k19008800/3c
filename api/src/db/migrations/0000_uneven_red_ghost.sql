CREATE TYPE "public"."agent_commission_status" AS ENUM('pending', 'settled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."agent_level" AS ENUM('junior', 'senior', 'partner');--> statement-breakpoint
CREATE TYPE "public"."agent_withdrawal_status" AS ENUM('pending', 'processing', 'completed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."api_key_status" AS ENUM('active', 'disabled', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."balance_transaction_type" AS ENUM('recharge', 'consumption', 'refund', 'adjustment', 'commission', 'withdrawal', 'freeze', 'unfreeze');--> statement-breakpoint
CREATE TYPE "public"."circuit_breaker_status" AS ENUM('active', 'open', 'half_open');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'issued', 'paid', 'cancelled', 'void');--> statement-breakpoint
CREATE TYPE "public"."recharge_order_status" AS ENUM('pending', 'paid', 'failed', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."supplier_key_select_mode" AS ENUM('single', 'polling', 'random');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'in_progress', 'waiting_customer', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('customer', 'agent', 'admin', 'super_admin');--> statement-breakpoint
CREATE TYPE "public"."model_status" AS ENUM('active', 'inactive', 'deprecated', 'beta');--> statement-breakpoint
CREATE TYPE "public"."pricing_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."supplier_status" AS ENUM('active', 'maintenance', 'offline', 'deprecated');--> statement-breakpoint
CREATE TABLE "agent_commissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"customer_user_id" integer NOT NULL,
	"consumption_record_id" integer,
	"amount" numeric(18, 4) NOT NULL,
	"rate" numeric(5, 2) NOT NULL,
	"status" "agent_commission_status" DEFAULT 'pending' NOT NULL,
	"settled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"customer_user_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"source" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_withdrawals" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"method" varchar(50) NOT NULL,
	"account_info" text,
	"status" "agent_withdrawal_status" DEFAULT 'pending' NOT NULL,
	"processed_by" integer,
	"processed_at" timestamp,
	"remark" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"level" "agent_level" DEFAULT 'junior' NOT NULL,
	"commission_rate" numeric(5, 2) DEFAULT '10.00' NOT NULL,
	"total_earnings" numeric(18, 4) DEFAULT '0',
	"available_balance" numeric(18, 4) DEFAULT '0',
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"invite_code" varchar(20),
	"contact_info" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agents_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "agents_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text NOT NULL,
	"type" varchar(30) DEFAULT 'info' NOT NULL,
	"priority" integer DEFAULT 0,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"key_hash" varchar(255) NOT NULL,
	"key_prefix" varchar(12) NOT NULL,
	"name" varchar(100) NOT NULL,
	"status" "api_key_status" DEFAULT 'active' NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb,
	"rate_limit_per_minute" integer DEFAULT 60,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"action" varchar(100) NOT NULL,
	"resource" varchar(100) NOT NULL,
	"resource_id" varchar(100),
	"details" jsonb,
	"ip_address" varchar(50),
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "balance_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" "balance_transaction_type" NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"balance_after" numeric(18, 4) NOT NULL,
	"reference_type" varchar(50),
	"reference_id" varchar(100),
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"type" varchar(50) DEFAULT 'recharge_bonus' NOT NULL,
	"description" text,
	"config" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"start_at" timestamp,
	"end_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "circuit_breaker_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_key" varchar(200) NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp DEFAULT now() NOT NULL,
	"status" "circuit_breaker_status" DEFAULT 'active' NOT NULL,
	"opened_at" timestamp,
	"last_probe_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "circuit_breaker_state_channel_key_unique" UNIQUE("channel_key")
);
--> statement-breakpoint
CREATE TABLE "consumption_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"api_key_id" integer,
	"request_id" varchar(100) NOT NULL,
	"model" varchar(200) NOT NULL,
	"supplier_id" integer,
	"supplier_model_id" integer,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"cost" numeric(18, 8) DEFAULT '0' NOT NULL,
	"currency" varchar(10) DEFAULT 'CNY',
	"trust_upstream" boolean DEFAULT false NOT NULL,
	"fallback" boolean DEFAULT false NOT NULL,
	"streamed" boolean DEFAULT false NOT NULL,
	"finish_reason" varchar(50),
	"error_code" varchar(50),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "consumption_records_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "coupon_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_code" varchar(50) NOT NULL,
	"batch_name" varchar(200),
	"coupon_type" varchar(30) DEFAULT 'fixed_amount' NOT NULL,
	"face_value" numeric(18, 2) NOT NULL,
	"min_recharge_amount" numeric(18, 2),
	"total_count" integer DEFAULT 0 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"max_per_user" integer DEFAULT 1,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"valid_from" timestamp,
	"valid_to" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_balances" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"total_balance" numeric(18, 4) DEFAULT '0' NOT NULL,
	"available_balance" numeric(18, 4) DEFAULT '0' NOT NULL,
	"frozen_balance" numeric(18, 4) DEFAULT '0' NOT NULL,
	"currency" varchar(10) DEFAULT 'CNY',
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customer_balances_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"subject" varchar(300) NOT NULL,
	"body" text NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb,
	"language" varchar(10) DEFAULT 'zh-CN',
	"status" varchar(20) DEFAULT 'active',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_templates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"invoice_no" varchar(50) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"tax" numeric(18, 2) DEFAULT '0',
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"title" varchar(200),
	"tax_id" varchar(50),
	"recipient" text,
	"issued_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_no_unique" UNIQUE("invoice_no")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"key_id" varchar(200) NOT NULL,
	"window_minute" integer NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recharge_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"order_no" varchar(50) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" varchar(10) DEFAULT 'CNY',
	"method" varchar(30) NOT NULL,
	"status" "recharge_order_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp,
	"note" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "recharge_orders_order_no_unique" UNIQUE("order_no")
);
--> statement-breakpoint
CREATE TABLE "risk_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" integer NOT NULL,
	"user_id" integer,
	"event_type" varchar(50) NOT NULL,
	"severity" varchar(20) DEFAULT 'medium' NOT NULL,
	"details" jsonb,
	"resolved" varchar(1) DEFAULT '0',
	"resolved_by" integer,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"rule_type" varchar(50) NOT NULL,
	"description" varchar(500),
	"config" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"key_value" text NOT NULL,
	"name" varchar(100),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"select_mode" "supplier_key_select_mode" DEFAULT 'single' NOT NULL,
	"current_balance" varchar(50),
	"balance_checked_at" timestamp,
	"priority" integer DEFAULT 0,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_models" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"model_name" varchar(200) NOT NULL,
	"platform_model" varchar(200) NOT NULL,
	"input_price" varchar(30) DEFAULT '0' NOT NULL,
	"output_price" varchar(30) DEFAULT '0' NOT NULL,
	"currency" varchar(10) DEFAULT 'CNY',
	"price_unit" varchar(20) DEFAULT 'per_1M_tokens',
	"status" "model_status" DEFAULT 'active' NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb,
	"max_tokens" integer,
	"description" text,
	"synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(50) NOT NULL,
	"base_url" varchar(500) NOT NULL,
	"api_type" varchar(50) DEFAULT 'openai' NOT NULL,
	"status" "supplier_status" DEFAULT 'active' NOT NULL,
	"health_status" varchar(20) DEFAULT 'unknown',
	"health_last_check" timestamp,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_name_unique" UNIQUE("name"),
	CONSTRAINT "suppliers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "system_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" text NOT NULL,
	"description" varchar(300),
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "system_config_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" varchar(50) DEFAULT 'general' NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"priority" varchar(20) DEFAULT 'normal',
	"assigned_to" integer,
	"resolution" text,
	"resolved_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" varchar(500) NOT NULL,
	"refresh_token" varchar(500),
	"ip_address" varchar(50),
	"user_agent" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"name" varchar(100) NOT NULL,
	"role" "user_role" DEFAULT 'customer' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"avatar_url" varchar(500),
	"phone" varchar(30),
	"email_verified" timestamp,
	"two_factor_enabled" varchar(1) DEFAULT '0',
	"last_login_at" timestamp,
	"last_login_ip" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vendor_pricing" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_model_id" integer NOT NULL,
	"pricing_group" varchar(50) DEFAULT 'default' NOT NULL,
	"input_price" varchar(30) NOT NULL,
	"output_price" varchar(30) NOT NULL,
	"output_multiplier" varchar(10) DEFAULT '1.0',
	"currency" varchar(10) DEFAULT 'CNY',
	"status" "pricing_status" DEFAULT 'draft' NOT NULL,
	"effective_from" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_customers" ADD CONSTRAINT "agent_customers_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_customers" ADD CONSTRAINT "agent_customers_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_records" ADD CONSTRAINT "consumption_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_records" ADD CONSTRAINT "consumption_records_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_balances" ADD CONSTRAINT "customer_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_keys" ADD CONSTRAINT "supplier_keys_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_models" ADD CONSTRAINT "supplier_models_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_pricing" ADD CONSTRAINT "vendor_pricing_supplier_model_id_supplier_models_id_fk" FOREIGN KEY ("supplier_model_id") REFERENCES "public"."supplier_models"("id") ON DELETE cascade ON UPDATE no action;