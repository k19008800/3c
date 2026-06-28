CREATE TYPE "public"."audit_action" AS ENUM('user_create', 'user_disable', 'user_enable', 'user_password_reset', 'balance_adjust', 'role_change', 'real_name_approve', 'real_name_reject', 'withdraw_approve', 'withdraw_reject', 'withdraw_first_approve', 'withdraw_second_approve', 'withdraw_paid', 'agent_create', 'agent_update', 'config_update', 'vendor_create', 'vendor_update', 'model_create', 'model_update', 'user_update', 'user_impersonate', 'order_cancel', 'recharge_confirm', 'recharge_first_confirm', 'recharge_second_confirm', 'system_maintenance');--> statement-breakpoint
CREATE TYPE "public"."balance_log_type" AS ENUM('recharge', 'consumption', 'refund', 'trial_grant', 'admin_adjust', 'negative_repay');--> statement-breakpoint
CREATE TYPE "public"."call_status" AS ENUM('success', 'failed', 'timeout', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."commission_status" AS ENUM('pending', 'settled');--> statement-breakpoint
CREATE TYPE "public"."model_type" AS ENUM('chat', 'embedding', 'image', 'audio');--> statement-breakpoint
CREATE TYPE "public"."oauth_provider" AS ENUM('wechat', 'google', 'apple', 'github');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'paid', 'cancelled', 'confirmed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."pay_channel" AS ENUM('wechat_scan', 'wechat_jsapi', 'alipay_scan', 'alipay_jsapi', 'bank_transfer');--> statement-breakpoint
CREATE TYPE "public"."real_name_status" AS ENUM('unverified', 'pending_review', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."team_role" AS ENUM('team_owner', 'team_admin', 'team_member');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'admin', 'agent', 'user');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('pending', 'active', 'disabled', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."user_type" AS ENUM('personal', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."vendor_status" AS ENUM('active', 'down', 'degraded', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."withdraw_status" AS ENUM('pending_first_review', 'pending_second_review', 'approved', 'rejected', 'paid');--> statement-breakpoint
CREATE TABLE "agent_clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"client_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_clients_client_user_id_unique" UNIQUE("client_user_id")
);
--> statement-breakpoint
CREATE TABLE "agent_customer_consumption" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"customer_user_id" integer NOT NULL,
	"customer_name" varchar(128),
	"bind_at" timestamp with time zone,
	"total_amount" numeric(18, 6) DEFAULT '0.000000',
	"month_amount" numeric(18, 6) DEFAULT '0.000000',
	"commission_amount" numeric(18, 6) DEFAULT '0.000000',
	"order_count" integer DEFAULT 0,
	"last_order_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"commission_rate" numeric(5, 4) DEFAULT '0.0000' NOT NULL,
	"total_commission" numeric(18, 6) DEFAULT '0.000000' NOT NULL,
	"pending_withdraw" numeric(18, 6) DEFAULT '0.000000' NOT NULL,
	"frozen_amount" numeric(18, 6) DEFAULT '0.000000' NOT NULL,
	"status" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"key_prefix" varchar(10) NOT NULL,
	"status" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"operator_id" integer NOT NULL,
	"action" "audit_action" NOT NULL,
	"target_type" varchar(50) NOT NULL,
	"target_id" integer,
	"before" jsonb,
	"after" jsonb,
	"ip" varchar(45),
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "balance_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"amount" numeric(18, 6) NOT NULL,
	"balance_after" numeric(18, 6) NOT NULL,
	"type" "balance_log_type" NOT NULL,
	"ref_type" varchar(50),
	"ref_id" integer,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_logs" (
	"id" serial NOT NULL,
	"user_id" integer NOT NULL,
	"api_key_id" integer,
	"model_id" integer,
	"vendor_model_id" integer,
	"vendor_name" varchar(100),
	"model_name" varchar(100),
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"cost" numeric(18, 6) DEFAULT '0.000000' NOT NULL,
	"duration_ms" integer,
	"status" "call_status" NOT NULL,
	"error_message" text,
	"is_streaming" boolean DEFAULT false NOT NULL,
	"ip" varchar(45),
	"user_agent" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "call_logs_id_created_at_pk" PRIMARY KEY("id","created_at")
);
--> statement-breakpoint
CREATE TABLE "commission_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"client_call_log_id" integer,
	"call_cost" numeric(18, 6) NOT NULL,
	"commission_amount" numeric(18, 6) NOT NULL,
	"status" "commission_status" DEFAULT 'pending' NOT NULL,
	"voucher_no" varchar(32),
	"commission_type" varchar(20),
	"source_order_id" varchar(64),
	"source_order_amount" numeric(18, 6),
	"source_customer_id" integer,
	"fee_rate" numeric(5, 4) DEFAULT '0.0000',
	"fee_amount" numeric(18, 6) DEFAULT '0.000000',
	"net_amount" numeric(18, 6),
	"rule_snapshot" jsonb,
	"calc_detail" jsonb,
	"balance_snapshot" numeric(18, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"subject_zh" varchar(255) NOT NULL,
	"subject_en" varchar(255) NOT NULL,
	"body_html_zh" text NOT NULL,
	"body_html_en" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_templates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"display_name" varchar(200),
	"type" "model_type" DEFAULT 'chat' NOT NULL,
	"status" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "models_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "page_contents" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(100) NOT NULL,
	"title_zh" varchar(255) NOT NULL,
	"title_en" varchar(255),
	"content_markdown_zh" text,
	"content_markdown_en" text,
	"status" boolean DEFAULT true NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_contents_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "recharge_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"order_no" varchar(64) NOT NULL,
	"amount" numeric(18, 6) NOT NULL,
	"channel" "pay_channel" NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"channel_order_no" varchar(128),
	"paid_at" timestamp with time zone,
	"voucher_image" varchar(500),
	"confirmed_by" integer,
	"confirmed_at" timestamp with time zone,
	"voucher_no" varchar(32),
	"payer_account_name" varchar(128),
	"payer_account_no" varchar(64),
	"transfer_remark" varchar(256),
	"bank_tx_id" varchar(64),
	"bank_tx_checked_at" timestamp with time zone,
	"first_confirmed_by" integer,
	"first_confirmed_at" timestamp with time zone,
	"second_confirmed_by" integer,
	"second_confirmed_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recharge_orders_order_no_unique" UNIQUE("order_no")
);
--> statement-breakpoint
CREATE TABLE "system_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" text NOT NULL,
	"description" varchar(500),
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_configs_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"role" "team_role" DEFAULT 'team_member' NOT NULL,
	"quota_balance" numeric(18, 6),
	"invited_at" timestamp with time zone,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_discounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"discount_rate" numeric(5, 4) DEFAULT '1.0000' NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_until" timestamp with time zone,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_ip_whitelist" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"ip" varchar(45) NOT NULL,
	"description" varchar(255),
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_login_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"ip" varchar(45) NOT NULL,
	"user_agent" varchar(500),
	"success" boolean NOT NULL,
	"fail_reason" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"content" text NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_oauth_bindings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" "oauth_provider" NOT NULL,
	"provider_user_id" varchar(255) NOT NULL,
	"provider_email" varchar(255),
	"nickname" varchar(100),
	"avatar_url" varchar(500),
	"raw_profile" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_real_name_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"version" integer NOT NULL,
	"real_name" varchar(100),
	"id_number" varchar(30),
	"id_front_image" varchar(500),
	"id_back_image" varchar(500),
	"company_name" varchar(255),
	"company_reg_number" varchar(50),
	"business_license" varchar(500),
	"bank_name" varchar(255),
	"bank_account" varchar(100),
	"bank_address" varchar(500),
	"invoice_title" varchar(255),
	"invoice_tax_id" varchar(50),
	"status" real_name_status DEFAULT 'pending_review' NOT NULL,
	"reviewer_id" integer,
	"reject_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_role_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"old_role" "user_role",
	"new_role" "user_role" NOT NULL,
	"operator_id" integer,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"nickname" varchar(100),
	"user_type" "user_type" DEFAULT 'personal' NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"status" "user_status" DEFAULT 'pending' NOT NULL,
	"disabled_reason" text,
	"disabled_by" integer,
	"disabled_at" timestamp with time zone,
	"disabled_until" timestamp with time zone,
	"real_name_status" real_name_status DEFAULT 'unverified' NOT NULL,
	"real_name" varchar(100),
	"id_number" varchar(30),
	"id_front_image" varchar(500),
	"id_back_image" varchar(500),
	"company_name" varchar(255),
	"company_reg_number" varchar(50),
	"business_license" varchar(500),
	"bank_name" varchar(255),
	"bank_account" varchar(100),
	"bank_address" varchar(500),
	"invoice_title" varchar(255),
	"invoice_tax_id" varchar(50),
	"reject_reason" text,
	"balance" numeric(18, 6) DEFAULT '0.000000' NOT NULL,
	"discount_rate" numeric(5, 4) DEFAULT '1.0000',
	"rpm_override" integer,
	"tpm_override" integer,
	"team_id" integer,
	"team_role" "team_role",
	"phone" varchar(20),
	"avatar_url" varchar(500),
	"last_login_at" timestamp with time zone,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "vendor_models" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_id" integer NOT NULL,
	"model_id" integer NOT NULL,
	"upstream_model_name" varchar(200) NOT NULL,
	"api_endpoint" varchar(500) NOT NULL,
	"api_key_encrypted" text NOT NULL,
	"cost_price_input" numeric(18, 6) DEFAULT '0.000000' NOT NULL,
	"cost_price_output" numeric(18, 6) DEFAULT '0.000000' NOT NULL,
	"sell_price_input" numeric(18, 6) DEFAULT '0.000000' NOT NULL,
	"sell_price_output" numeric(18, 6) DEFAULT '0.000000' NOT NULL,
	"weight" integer DEFAULT 100 NOT NULL,
	"rpm_limit" integer,
	"tpm_limit" integer,
	"status" boolean DEFAULT true NOT NULL,
	"health_score" numeric(5, 2) DEFAULT '1.00',
	"health_samples" integer DEFAULT 0,
	"consecutive_success" integer DEFAULT 0,
	"last_health_check_at" timestamp with time zone,
	"is_down" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"base_url" varchar(500) NOT NULL,
	"status" "vendor_status" DEFAULT 'active' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendors_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "withdraw_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"amount" numeric(18, 6) NOT NULL,
	"wechat_pay_no" varchar(128),
	"status" "withdraw_status" DEFAULT 'pending_first_review' NOT NULL,
	"voucher_no" varchar(32),
	"fee_amount" numeric(18, 6) DEFAULT '0.000000',
	"actual_amount" numeric(18, 6),
	"bank_card_no" varchar(64),
	"bank_name" varchar(128),
	"bank_voucher_url" varchar(512),
	"risk_check_result" jsonb,
	"audit_level" integer,
	"first_auditor_id" integer,
	"first_audited_at" timestamp with time zone,
	"second_auditor_id" integer,
	"second_audited_at" timestamp with time zone,
	"paid_operator_id" integer,
	"matched_bank_tx_id" integer,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"reject_reason" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_clients" ADD CONSTRAINT "agent_clients_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_clients" ADD CONSTRAINT "agent_clients_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_customer_consumption" ADD CONSTRAINT "agent_customer_consumption_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_customer_consumption" ADD CONSTRAINT "agent_customer_consumption_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_logs" ADD CONSTRAINT "balance_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_vendor_model_id_vendor_models_id_fk" FOREIGN KEY ("vendor_model_id") REFERENCES "public"."vendor_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_logs" ADD CONSTRAINT "commission_logs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_logs" ADD CONSTRAINT "commission_logs_source_customer_id_users_id_fk" FOREIGN KEY ("source_customer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_contents" ADD CONSTRAINT "page_contents_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recharge_orders" ADD CONSTRAINT "recharge_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recharge_orders" ADD CONSTRAINT "recharge_orders_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recharge_orders" ADD CONSTRAINT "recharge_orders_first_confirmed_by_users_id_fk" FOREIGN KEY ("first_confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recharge_orders" ADD CONSTRAINT "recharge_orders_second_confirmed_by_users_id_fk" FOREIGN KEY ("second_confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_configs" ADD CONSTRAINT "system_configs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_discounts" ADD CONSTRAINT "user_discounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_discounts" ADD CONSTRAINT "user_discounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ip_whitelist" ADD CONSTRAINT "user_ip_whitelist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_login_history" ADD CONSTRAINT "user_login_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notes" ADD CONSTRAINT "user_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notes" ADD CONSTRAINT "user_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_oauth_bindings" ADD CONSTRAINT "user_oauth_bindings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_real_name_reviews" ADD CONSTRAINT "user_real_name_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_real_name_reviews" ADD CONSTRAINT "user_real_name_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_history" ADD CONSTRAINT "user_role_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_history" ADD CONSTRAINT "user_role_history_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_disabled_by_users_id_fk" FOREIGN KEY ("disabled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_models" ADD CONSTRAINT "vendor_models_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_models" ADD CONSTRAINT "vendor_models_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdraw_orders" ADD CONSTRAINT "withdraw_orders_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdraw_orders" ADD CONSTRAINT "withdraw_orders_first_auditor_id_users_id_fk" FOREIGN KEY ("first_auditor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdraw_orders" ADD CONSTRAINT "withdraw_orders_second_auditor_id_users_id_fk" FOREIGN KEY ("second_auditor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdraw_orders" ADD CONSTRAINT "withdraw_orders_paid_operator_id_users_id_fk" FOREIGN KEY ("paid_operator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdraw_orders" ADD CONSTRAINT "withdraw_orders_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_clients_agent_id_idx" ON "agent_clients" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_clients_client_idx" ON "agent_clients" USING btree ("client_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_consumption_agent_customer_idx" ON "agent_customer_consumption" USING btree ("agent_id","customer_user_id");--> statement-breakpoint
CREATE INDEX "agent_consumption_agent_id_idx" ON "agent_customer_consumption" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_user_id_idx" ON "agents" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_user_id_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_keys_status_idx" ON "api_keys" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_logs_operator_idx" ON "audit_logs" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "balance_logs_user_created_at_idx" ON "balance_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "balance_logs_type_idx" ON "balance_logs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "call_logs_user_created_at_idx" ON "call_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "call_logs_api_key_created_at_idx" ON "call_logs" USING btree ("api_key_id","created_at");--> statement-breakpoint
CREATE INDEX "call_logs_vendor_created_at_idx" ON "call_logs" USING btree ("vendor_name","created_at");--> statement-breakpoint
CREATE INDEX "call_logs_status_created_at_idx" ON "call_logs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "call_logs_created_at_idx" ON "call_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "commission_logs_agent_id_idx" ON "commission_logs" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "commission_logs_status_idx" ON "commission_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "commission_logs_created_at_idx" ON "commission_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "commission_logs_voucher_no_idx" ON "commission_logs" USING btree ("voucher_no");--> statement-breakpoint
CREATE UNIQUE INDEX "email_templates_name_idx" ON "email_templates" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "models_name_idx" ON "models" USING btree ("name");--> statement-breakpoint
CREATE INDEX "models_type_status_idx" ON "models" USING btree ("type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "page_contents_slug_idx" ON "page_contents" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "recharge_orders_order_no_idx" ON "recharge_orders" USING btree ("order_no");--> statement-breakpoint
CREATE INDEX "recharge_orders_user_id_idx" ON "recharge_orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recharge_orders_status_idx" ON "recharge_orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "system_configs_key_idx" ON "system_configs" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_user_id_idx" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_members_team_id_role_idx" ON "team_members" USING btree ("team_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "user_discounts_user_id_idx" ON "user_discounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_ip_whitelist_user_id_ip_idx" ON "user_ip_whitelist" USING btree ("user_id","ip");--> statement-breakpoint
CREATE INDEX "user_login_history_user_created_at_idx" ON "user_login_history" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "user_login_history_created_at_idx" ON "user_login_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_notes_user_id_idx" ON "user_notes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_oauth_user_provider_idx" ON "user_oauth_bindings" USING btree ("user_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "user_oauth_provider_user_idx" ON "user_oauth_bindings" USING btree ("provider","provider_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_real_name_user_version_idx" ON "user_real_name_reviews" USING btree ("user_id","version");--> statement-breakpoint
CREATE INDEX "user_real_name_user_id_idx" ON "user_real_name_reviews" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_real_name_status_idx" ON "user_real_name_reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_role_history_user_id_idx" ON "user_role_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_role_history_created_at_idx" ON "user_role_history" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_team_id_idx" ON "users" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "users_real_name_status_idx" ON "users" USING btree ("real_name_status");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_models_vendor_model_idx" ON "vendor_models" USING btree ("vendor_id","model_id");--> statement-breakpoint
CREATE INDEX "vendor_models_model_id_idx" ON "vendor_models" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "vendor_models_vendor_down_idx" ON "vendor_models" USING btree ("vendor_id","is_down");--> statement-breakpoint
CREATE UNIQUE INDEX "vendors_name_idx" ON "vendors" USING btree ("name");--> statement-breakpoint
CREATE INDEX "withdraw_orders_agent_id_idx" ON "withdraw_orders" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "withdraw_orders_status_idx" ON "withdraw_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "withdraw_orders_voucher_no_idx" ON "withdraw_orders" USING btree ("voucher_no");