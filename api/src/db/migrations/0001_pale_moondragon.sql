CREATE TYPE "public"."contact_method" AS ENUM('phone', 'wechat', 'email', 'meeting', 'other');--> statement-breakpoint
CREATE TYPE "public"."customer_status" AS ENUM('lead', 'trial', 'active', 'silent', 'churned');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recharge_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"order_id" varchar(64) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"pay_amount" numeric(18, 2),
	"actual_amount" numeric(18, 2),
	"payment_method" varchar(20) NOT NULL,
	"trade_no" varchar(128),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"promotion_id" integer,
	"free_amount" numeric(18, 2),
	"voucher_path" varchar(255),
	"review_note" varchar(500),
	"expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recharge_orders_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "balance_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" varchar(20) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"balance_before" numeric(18, 2) NOT NULL,
	"balance_after" numeric(18, 2) NOT NULL,
	"order_id" varchar(64),
	"recharge_order_id" integer,
	"description" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"level" varchar(20) DEFAULT 'prepare' NOT NULL,
	"commission_rate" numeric(5, 4) DEFAULT '0' NOT NULL,
	"verify_status" varchar(20) DEFAULT 'unverified' NOT NULL,
	"withdraw_account" varchar(64),
	"withdraw_bank" varchar(100),
	"withdraw_name" varchar(50),
	"notif_prefs" varchar(255) DEFAULT '{}',
	"referral_code" varchar(32),
	"created_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "agent_profiles_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_withdrawals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"agent_profile_id" integer,
	"withdrawal_no" varchar(64) NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"account" varchar(64) NOT NULL,
	"bank" varchar(100),
	"account_name" varchar(50),
	"status" varchar(30) DEFAULT 'pending_first_review' NOT NULL,
	"first_reviewer_id" integer,
	"first_review_at" timestamp with time zone,
	"first_review_note" varchar(500),
	"second_reviewer_id" integer,
	"second_review_at" timestamp with time zone,
	"second_review_note" varchar(500),
	"reject_reason" varchar(500),
	"transfer_no" varchar(128),
	"transfer_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_withdrawals_withdrawal_no_unique" UNIQUE("withdrawal_no")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_customer_bindings" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_user_id" integer NOT NULL,
	"customer_user_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"bound_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unbound_at" timestamp with time zone,
	"operator_id" integer,
	"reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_report_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_user_id" integer NOT NULL,
	"target_phone" varchar(32),
	"target_email" varchar(255),
	"target_user_id" integer,
	"note" varchar(500),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"audit_operator_id" integer,
	"audit_at" timestamp with time zone,
	"reject_reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_binding_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_user_id" integer NOT NULL,
	"from_agent_user_id" integer,
	"to_agent_user_id" integer,
	"action" varchar(20) NOT NULL,
	"operator_id" integer,
	"reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"invoice_no" varchar(64),
	"amount" numeric(18, 2) NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT '13' NOT NULL,
	"tax_amount" numeric(18, 2),
	"total_amount" numeric(18, 2),
	"type" varchar(20) DEFAULT 'ordinary' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"title" varchar(200) NOT NULL,
	"tax_no" varchar(50),
	"address" varchar(200),
	"bank_account" varchar(200),
	"email" varchar(100),
	"remark" varchar(500),
	"reject_reason" varchar(500),
	"issued_by" integer,
	"issued_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_commissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"billing_log_id" bigint,
	"agent_profile_id" integer,
	"consumption_amount" numeric(18, 4) NOT NULL,
	"rate" numeric(5, 4) NOT NULL,
	"commission_amount" numeric(18, 4) NOT NULL,
	"level" varchar(20),
	"status" varchar(20) DEFAULT 'settled' NOT NULL,
	"period_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "real_name_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" varchar(20) DEFAULT 'individual' NOT NULL,
	"real_name" varchar(100) NOT NULL,
	"id_number" varchar(50) NOT NULL,
	"phone" varchar(20),
	"legal_person" varchar(50),
	"company_address" varchar(200),
	"status" varchar(20) DEFAULT 'pending_review' NOT NULL,
	"reviewer_id" integer,
	"reviewed_at" timestamp with time zone,
	"reject_reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "redemption_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"creator_id" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "redemption_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"code" varchar(32) NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"status" varchar(20) DEFAULT 'unused' NOT NULL,
	"used_by" integer,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "redemption_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "redemption_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"code_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"batch_id" integer,
	"amount" numeric(18, 4) NOT NULL,
	"code" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcement_reads" (
	"id" serial PRIMARY KEY NOT NULL,
	"announcement_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(500) NOT NULL,
	"content" text NOT NULL,
	"type" varchar(50) DEFAULT 'system_announcement' NOT NULL,
	"status" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"subject_zh" varchar(255) NOT NULL,
	"body_html_zh" text NOT NULL,
	"subject_en" varchar(255),
	"body_html_en" text,
	"description" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_templates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaign_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"trigger_type" varchar(30) DEFAULT 'recharge' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"auto_end" boolean DEFAULT true NOT NULL,
	"budget_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"type" varchar(30) DEFAULT 'recharge_gift' NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"channel" varchar(20) DEFAULT 'site' NOT NULL,
	"notify_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_settlements" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_id" integer NOT NULL,
	"period" varchar(7) NOT NULL,
	"total_calls" integer DEFAULT 0 NOT NULL,
	"success_calls" integer DEFAULT 0 NOT NULL,
	"failed_calls" integer DEFAULT 0 NOT NULL,
	"total_tokens" bigint DEFAULT 0 NOT NULL,
	"total_cost" numeric(18, 4) DEFAULT '0' NOT NULL,
	"user_revenue" numeric(18, 4) DEFAULT '0' NOT NULL,
	"commission_rate" numeric(5, 4) DEFAULT '0' NOT NULL,
	"commission_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"settlement_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"dispute_reason" text,
	"generated_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" integer,
	"paid_at" timestamp with time zone,
	"paid_by" integer,
	"payment_reference" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"to_address" varchar(255) NOT NULL,
	"subject" varchar(500) NOT NULL,
	"template_name" varchar(100),
	"vars" text,
	"status" varchar(20) DEFAULT 'sent' NOT NULL,
	"error" text,
	"message_id" varchar(200),
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"serial_no" varchar(40) NOT NULL,
	"type" varchar(50) NOT NULL,
	"direction" varchar(10) NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"balance_after" numeric(18, 4) NOT NULL,
	"user_id" integer,
	"agent_id" integer,
	"vendor_id" integer,
	"related_order_no" varchar(64),
	"external_ref" varchar(128),
	"payment_channel" varchar(30),
	"status" varchar(20) DEFAULT 'completed' NOT NULL,
	"remark" text,
	"operator_id" integer,
	"reversed_by_serial" varchar(40),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_ledger_serial_no_unique" UNIQUE("serial_no")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reconciliation_differences" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject_type" varchar(10) NOT NULL,
	"subject_id" integer NOT NULL,
	"period" varchar(10) NOT NULL,
	"platform_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"counterparty_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"diff_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"check_type" varchar(30) DEFAULT 'settlement' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"resolve_mode" varchar(20),
	"remark" text,
	"resolved_by" integer,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounting_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"period" varchar(7) NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"income_total" numeric(18, 4) DEFAULT '0' NOT NULL,
	"expense_total" numeric(18, 4) DEFAULT '0' NOT NULL,
	"gross_profit" numeric(18, 4) DEFAULT '0' NOT NULL,
	"gross_margin" numeric(18, 4) DEFAULT '0' NOT NULL,
	"locked_by" integer,
	"locked_at" timestamp with time zone,
	"unlocked_by" integer,
	"unlocked_reason" text,
	"unlocked_at" timestamp with time zone,
	"relock_at" timestamp with time zone,
	"voucher_no" varchar(40),
	"check_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
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
CREATE TABLE IF NOT EXISTS "session_trusted_devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"device_fingerprint" varchar(64) NOT NULL,
	"trusted_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
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
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_ticket_no_unique" UNIQUE("ticket_no")
);
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
CREATE TABLE IF NOT EXISTS "ticket_satisfaction" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_tag_defs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"color" varchar(20) DEFAULT '#6366f1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_tag_defs_name_unique" UNIQUE("name")
);
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
CREATE TABLE IF NOT EXISTS "chat_presets" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" varchar(20) NOT NULL,
	"title" varchar(100),
	"content" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
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
CREATE TABLE IF NOT EXISTS "staff_test_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"key_prefix" varchar(20) NOT NULL,
	"name" varchar(100),
	"associated_user_id" integer,
	"token_limit" bigint DEFAULT 1000000 NOT NULL,
	"cost_limit" numeric(10, 2) DEFAULT '5.00' NOT NULL,
	"used_tokens" bigint DEFAULT 0 NOT NULL,
	"used_cost" numeric(10, 2) DEFAULT '0' NOT NULL,
	"is_test" boolean DEFAULT true NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_test_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"rating" integer NOT NULL,
	"comment" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_chat_status" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'offline' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "privacy_policy_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"version" varchar(20) NOT NULL,
	"title" varchar(200),
	"content" text NOT NULL,
	"summary" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_privacy_consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"version_id" integer NOT NULL,
	"consented_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" varchar(45)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "terms_of_service_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"version" varchar(20) NOT NULL,
	"title" varchar(200),
	"content" text NOT NULL,
	"summary" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_tos_consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"version_id" integer NOT NULL,
	"consented_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" varchar(45)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "data_export_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"processed_by" integer,
	"processed_at" timestamp with time zone,
	"file_url" text,
	"file_expires_at" timestamp with time zone,
	"file_size_bytes" bigint,
	"file_count" integer DEFAULT 0,
	"error_message" text,
	"reject_reason" text,
	"retry_count" integer DEFAULT 0,
	"notification_sent" boolean DEFAULT false NOT NULL,
	"deadline" timestamp with time zone,
	"priority" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_export_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"part_number" integer DEFAULT 1,
	"status" varchar(20) DEFAULT 'pending',
	"file_url" text,
	"file_size_bytes" bigint,
	"data_type" varchar(50),
	"date_range" varchar(50),
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"label" varchar(100) NOT NULL,
	"description" text,
	"permissions" bigint DEFAULT 0 NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role_permission_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" varchar(30) NOT NULL,
	"operator_id" integer,
	"target_user_id" integer,
	"target_role_id" integer,
	"detail" text,
	"diff" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_role_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"assigned_by" integer,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"salesperson_id" integer NOT NULL,
	"method" "contact_method" NOT NULL,
	"summary" text NOT NULL,
	"next_follow_up" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_status_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"salesperson_id" integer NOT NULL,
	"from_status" "customer_status",
	"to_status" "customer_status" NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_tag_defs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"color" varchar(7) DEFAULT '#6366f1',
	"is_preset" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customer_tag_defs_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"salesperson_id" integer NOT NULL,
	"status" "customer_status" DEFAULT 'lead' NOT NULL,
	"tags" text[] DEFAULT '{}',
	"notes" text,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customers_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "follow_reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"salesperson_id" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"due_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_performance" (
	"id" serial PRIMARY KEY NOT NULL,
	"salesperson_id" integer NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"new_customers" integer DEFAULT 0 NOT NULL,
	"total_revenue" numeric(12, 2) DEFAULT '0' NOT NULL,
	"commission" numeric(12, 2) DEFAULT '0' NOT NULL,
	"customer_count" integer DEFAULT 0 NOT NULL,
	"active_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_settlements" (
	"id" serial PRIMARY KEY NOT NULL,
	"cycle_id" integer NOT NULL,
	"agent_user_id" integer NOT NULL,
	"total_commission" numeric(18, 4) DEFAULT '0' NOT NULL,
	"adjustment_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"adjustment_reason" text,
	"settled_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settlement_confirm_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"settlement_id" integer NOT NULL,
	"action" varchar(20) NOT NULL,
	"operator_id" integer,
	"operator_role" varchar(20) NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settlement_cycles" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"generated_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settlement_details" (
	"id" serial PRIMARY KEY NOT NULL,
	"settlement_id" integer NOT NULL,
	"commission_id" integer NOT NULL,
	"amount" numeric(18, 8) DEFAULT '0' NOT NULL,
	"client_user_id" integer NOT NULL,
	"consumption_id" integer,
	"model" varchar(100),
	"tokens" integer DEFAULT 0,
	"commission_rate" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_base_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(200) NOT NULL,
	"category" varchar(100),
	"content" text,
	"tags" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"helpful_count" integer DEFAULT 0 NOT NULL,
	"unhelpful_count" integer DEFAULT 0 NOT NULL,
	"author_id" integer,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_base_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" varchar(255),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_base_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_base_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"user_id" integer,
	"helpful" boolean NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quick_reply_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"category" varchar(50),
	"content" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_delivery_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"webhook_id" integer NOT NULL,
	"event" varchar(50) NOT NULL,
	"payload" text,
	"response_code" integer,
	"response_body" text,
	"latency_ms" integer,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"url" varchar(500) NOT NULL,
	"events" text NOT NULL,
	"secret" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"retry_count" integer DEFAULT 3 NOT NULL,
	"timeout_ms" integer DEFAULT 5000 NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "enterprise_oauth_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" varchar(20) NOT NULL,
	"label" varchar(50),
	"is_enabled" boolean DEFAULT false NOT NULL,
	"config" text NOT NULL,
	"auto_create_user" boolean DEFAULT true NOT NULL,
	"default_role" varchar(50),
	"sync_contacts" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enterprise_oauth_configs_platform_unique" UNIQUE("platform")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sso_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" varchar(30) NOT NULL,
	"label" varchar(50) DEFAULT 'SSO',
	"is_enabled" boolean DEFAULT false NOT NULL,
	"config" text NOT NULL,
	"forced_domains" text,
	"default_role" varchar(50),
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sso_configs_provider_unique" UNIQUE("provider")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_notification_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"email_enabled" boolean DEFAULT true,
	"email_frequency" varchar(20) DEFAULT 'daily',
	"email_digest_time" varchar(5) DEFAULT '09:00',
	"in_app_preferences" jsonb DEFAULT '{}'::jsonb,
	"email_preferences" jsonb DEFAULT '{}'::jsonb,
	"balance_low_threshold" integer DEFAULT 10,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text,
	"category" varchar(30) DEFAULT 'system' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_owner_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" varchar(20) DEFAULT 'member' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"joined_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account_deletion_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"reason" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"cooling_deadline" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"rejected_reason" text,
	"processed_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deletion_checklist" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"check_item" varchar(50) NOT NULL,
	"passed" varchar(10) DEFAULT 'false' NOT NULL,
	"detail" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "risk_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"type" varchar(30) DEFAULT 'ip' NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action" varchar(30) DEFAULT 'block' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "security_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" varchar(50) NOT NULL,
	"severity" varchar(20) DEFAULT 'medium' NOT NULL,
	"user_id" integer,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" varchar(64),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"handled_by" integer,
	"handled_at" timestamp with time zone,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscription_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"price" numeric(18, 2) DEFAULT '0' NOT NULL,
	"billing_cycle" varchar(20) DEFAULT 'monthly' NOT NULL,
	"model_limit" integer,
	"request_limit" integer,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscription_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"start_at" timestamp with time zone DEFAULT now() NOT NULL,
	"end_at" timestamp with time zone,
	"auto_renew" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "balance_alert_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"user_id" integer,
	"threshold_percent" integer DEFAULT 80 NOT NULL,
	"channel" varchar(20) DEFAULT 'both' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_secret" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_verified" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_enabled_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_failed_attempts" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_locked_until" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "consent_status" varchar(20) DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_status" varchar(20) DEFAULT 'not_started';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_step" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "api_auth_type" varchar(20) DEFAULT 'api_key';--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "commission_rate" varchar(10) DEFAULT '0.1000';--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "contact_email" varchar(255);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "password_hash" varchar(255);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "reviewed_by" integer;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "reject_reason" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recharge_orders" ADD CONSTRAINT "recharge_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "balance_logs" ADD CONSTRAINT "balance_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_withdrawals" ADD CONSTRAINT "agent_withdrawals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_withdrawals" ADD CONSTRAINT "agent_withdrawals_agent_profile_id_agent_profiles_id_fk" FOREIGN KEY ("agent_profile_id") REFERENCES "public"."agent_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_customer_bindings" ADD CONSTRAINT "agent_customer_bindings_agent_user_id_users_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_customer_bindings" ADD CONSTRAINT "agent_customer_bindings_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_customer_bindings" ADD CONSTRAINT "agent_customer_bindings_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_report_requests" ADD CONSTRAINT "agent_report_requests_agent_user_id_users_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_report_requests" ADD CONSTRAINT "agent_report_requests_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_report_requests" ADD CONSTRAINT "agent_report_requests_audit_operator_id_users_id_fk" FOREIGN KEY ("audit_operator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_binding_logs" ADD CONSTRAINT "agent_binding_logs_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_binding_logs" ADD CONSTRAINT "agent_binding_logs_from_agent_user_id_users_id_fk" FOREIGN KEY ("from_agent_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_binding_logs" ADD CONSTRAINT "agent_binding_logs_to_agent_user_id_users_id_fk" FOREIGN KEY ("to_agent_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_binding_logs" ADD CONSTRAINT "agent_binding_logs_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_agent_profile_id_agent_profiles_id_fk" FOREIGN KEY ("agent_profile_id") REFERENCES "public"."agent_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "real_name_records" ADD CONSTRAINT "real_name_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "redemption_batches" ADD CONSTRAINT "redemption_batches_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "redemption_codes" ADD CONSTRAINT "redemption_codes_batch_id_redemption_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."redemption_batches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "redemption_logs" ADD CONSTRAINT "redemption_logs_code_id_redemption_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."redemption_codes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "redemption_logs" ADD CONSTRAINT "redemption_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "redemption_logs" ADD CONSTRAINT "redemption_logs_batch_id_redemption_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."redemption_batches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaign_participants" ADD CONSTRAINT "campaign_participants_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaign_participants" ADD CONSTRAINT "campaign_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_settlements" ADD CONSTRAINT "vendor_settlements_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "budget_alert_logs" ADD CONSTRAINT "budget_alert_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "budget_block_logs" ADD CONSTRAINT "budget_block_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_budget_settings" ADD CONSTRAINT "user_budget_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "session_trusted_devices" ADD CONSTRAINT "session_trusted_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_recovery_codes" ADD CONSTRAINT "user_recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "key_permission_changes" ADD CONSTRAINT "key_permission_changes_key_id_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "key_permission_changes" ADD CONSTRAINT "key_permission_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_operation_logs" ADD CONSTRAINT "ticket_operation_logs_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_replies" ADD CONSTRAINT "ticket_replies_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_replies" ADD CONSTRAINT "ticket_replies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_satisfaction" ADD CONSTRAINT "ticket_satisfaction_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_test_keys" ADD CONSTRAINT "staff_test_keys_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_chat_status" ADD CONSTRAINT "staff_chat_status_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_privacy_consents" ADD CONSTRAINT "user_privacy_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_privacy_consents" ADD CONSTRAINT "user_privacy_consents_version_id_privacy_policy_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."privacy_policy_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_tos_consents" ADD CONSTRAINT "user_tos_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_tos_consents" ADD CONSTRAINT "user_tos_consents_version_id_terms_of_service_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."terms_of_service_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_export_jobs" ADD CONSTRAINT "user_export_jobs_request_id_data_export_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."data_export_requests"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_role_id_admin_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."admin_roles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_salesperson_id_users_id_fk" FOREIGN KEY ("salesperson_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_status_logs" ADD CONSTRAINT "customer_status_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_status_logs" ADD CONSTRAINT "customer_status_logs_salesperson_id_users_id_fk" FOREIGN KEY ("salesperson_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_salesperson_id_users_id_fk" FOREIGN KEY ("salesperson_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "follow_reminders" ADD CONSTRAINT "follow_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "follow_reminders" ADD CONSTRAINT "follow_reminders_salesperson_id_users_id_fk" FOREIGN KEY ("salesperson_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_performance" ADD CONSTRAINT "sales_performance_salesperson_id_users_id_fk" FOREIGN KEY ("salesperson_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_settlements" ADD CONSTRAINT "agent_settlements_cycle_id_settlement_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."settlement_cycles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_settlements" ADD CONSTRAINT "agent_settlements_agent_user_id_users_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "settlement_confirm_logs" ADD CONSTRAINT "settlement_confirm_logs_settlement_id_agent_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."agent_settlements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "settlement_confirm_logs" ADD CONSTRAINT "settlement_confirm_logs_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "settlement_details" ADD CONSTRAINT "settlement_details_settlement_id_agent_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."agent_settlements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "settlement_details" ADD CONSTRAINT "settlement_details_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_base_articles" ADD CONSTRAINT "knowledge_base_articles_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_base_feedback" ADD CONSTRAINT "knowledge_base_feedback_article_id_knowledge_base_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."knowledge_base_articles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_base_feedback" ADD CONSTRAINT "knowledge_base_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quick_reply_templates" ADD CONSTRAINT "quick_reply_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhook_delivery_logs" ADD CONSTRAINT "webhook_delivery_logs_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enterprise_oauth_configs" ADD CONSTRAINT "enterprise_oauth_configs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sso_configs" ADD CONSTRAINT "sso_configs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_owner_id_users_id_fk" FOREIGN KEY ("team_owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deletion_checklist" ADD CONSTRAINT "deletion_checklist_request_id_account_deletion_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."account_deletion_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "risk_rules" ADD CONSTRAINT "risk_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "security_events" ADD CONSTRAINT "security_events_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_users" ADD CONSTRAINT "subscription_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_users" ADD CONSTRAINT "subscription_users_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "balance_alert_rules" ADD CONSTRAINT "balance_alert_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_recharge_user_id" ON "recharge_orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_recharge_status" ON "recharge_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bl_user_id" ON "balance_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bl_type" ON "balance_logs" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bl_created" ON "balance_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_profile_level" ON "agent_profiles" USING btree ("level");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_aw_user" ON "agent_withdrawals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_aw_status" ON "agent_withdrawals" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_aw_created" ON "agent_withdrawals" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "acb_customer_unique_active" ON "agent_customer_bindings" USING btree ("customer_user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_acb_agent" ON "agent_customer_bindings" USING btree ("agent_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_acb_customer" ON "agent_customer_bindings" USING btree ("customer_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_arr_status" ON "agent_report_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_arr_agent" ON "agent_report_requests" USING btree ("agent_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_abl_customer" ON "agent_binding_logs" USING btree ("customer_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_abl_created" ON "agent_binding_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inv_user" ON "invoices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inv_status" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inv_created" ON "invoices" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_comm_agent_billing" ON "agent_commissions" USING btree ("agent_id","billing_log_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_comm_agent" ON "agent_commissions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_comm_agent_created" ON "agent_commissions" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rnr_user" ON "real_name_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rnr_status" ON "real_name_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rb_status" ON "redemption_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rb_creator" ON "redemption_batches" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rc_batch" ON "redemption_codes" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rc_status" ON "redemption_codes" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rl_user" ON "redemption_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rl_created" ON "redemption_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ann_read_user" ON "announcement_reads" USING btree ("announcement_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ann_status" ON "announcements" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ann_created" ON "announcements" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_templates_name" ON "email_templates" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cp_campaign" ON "campaign_participants" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cp_user" ON "campaign_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_camp_status" ON "campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_camp_created_by" ON "campaigns" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_camp_start_end" ON "campaigns" USING btree ("start_at","end_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_notif_sub_user_type_channel" ON "notification_subscriptions" USING btree ("user_id","type","channel");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notif_sub_user" ON "notification_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uk_vset_vendor_period" ON "vendor_settlements" USING btree ("vendor_id","period");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vset_status" ON "vendor_settlements" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vset_vendor" ON "vendor_settlements" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_logs_created" ON "email_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_logs_status" ON "email_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ledger_type" ON "platform_ledger" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ledger_user" ON "platform_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ledger_vendor" ON "platform_ledger" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ledger_created" ON "platform_ledger" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rd_status" ON "reconciliation_differences" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rd_subject" ON "reconciliation_differences" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uk_ap_period" ON "accounting_periods" USING btree ("period");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ap_status" ON "accounting_periods" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_budget_alert_user" ON "budget_alert_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_budget_block_user" ON "budget_block_logs" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uk_user_budget" ON "user_budget_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trusted_device_user" ON "session_trusted_devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trusted_device_fp" ON "session_trusted_devices" USING btree ("device_fingerprint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_recovery_code_user" ON "user_recovery_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_device_user" ON "user_devices" USING btree ("user_id","is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_device_fp" ON "user_devices" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kpc_key" ON "key_permission_changes" USING btree ("key_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tickets_user" ON "tickets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tickets_status" ON "tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tickets_assignee" ON "tickets" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tickets_created" ON "tickets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_op_ticket" ON "ticket_operation_logs" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_rep_ticket" ON "ticket_replies" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_sat_ticket" ON "ticket_satisfaction" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_msg_session" ON "chat_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_preset_type" ON "chat_presets" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_user" ON "chat_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_staff" ON "chat_sessions" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_status" ON "chat_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_test_key_staff" ON "staff_test_keys" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_test_key_hash" ON "staff_test_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_fb_session" ON "chat_feedback" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uk_staff_status" ON "staff_chat_status" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ppv_status" ON "privacy_policy_versions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upc_user" ON "user_privacy_consents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upc_version" ON "user_privacy_consents" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tosv_status" ON "terms_of_service_versions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_utc_user" ON "user_tos_consents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_utc_version" ON "user_tos_consents" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_der_user" ON "data_export_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_der_status" ON "data_export_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_uej_request" ON "user_export_jobs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_roles_name" ON "admin_roles" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rpal_created" ON "role_permission_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rpal_action" ON "role_permission_audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ura_user" ON "user_role_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ura_role" ON "user_role_assignments" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_settlement_cycle_agent" ON "agent_settlements" USING btree ("cycle_id","agent_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_settlement_agent" ON "agent_settlements" USING btree ("agent_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_settlement_status" ON "agent_settlements" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_settlement_log_sid" ON "settlement_confirm_logs" USING btree ("settlement_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_settlement_cycle_period" ON "settlement_cycles" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_settlement_detail_sid" ON "settlement_details" USING btree ("settlement_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kb_status" ON "knowledge_base_articles" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kb_category" ON "knowledge_base_articles" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kb_search" ON "knowledge_base_articles" USING btree ("title","tags");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kb_feedback_article" ON "knowledge_base_feedback" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_qr_category" ON "quick_reply_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wh_log_webhook" ON "webhook_delivery_logs" USING btree ("webhook_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wh_log_status" ON "webhook_delivery_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_enterprise_oauth_platform" ON "enterprise_oauth_configs" USING btree ("platform");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sso_provider" ON "sso_configs" USING btree ("provider");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_notif_prefs_new" ON "user_notification_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_un_user" ON "user_notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_un_user_read" ON "user_notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_un_created" ON "user_notifications" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_team_owner_member" ON "team_members" USING btree ("team_owner_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_team_owner" ON "team_members" USING btree ("team_owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_team_member_user" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_checklist_request_item" ON "deletion_checklist" USING btree ("request_id","check_item");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_risk_rules_type" ON "risk_rules" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_se_events_type" ON "security_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_se_events_user" ON "security_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_se_events_status" ON "security_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sp_status" ON "subscription_plans" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_su_user" ON "subscription_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_su_plan" ON "subscription_users" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_su_status" ON "subscription_users" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bar_user" ON "balance_alert_rules" USING btree ("user_id");