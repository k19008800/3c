--> statement-breakpoint
-- 迁移 0021: 权限管理引擎底座（§30）
-- 对齐 SPEC-§30-权限管理.md（D1-D6 子模块）
-- 1. admin_roles — 角色定义（bitset 权限位）
-- 2. user_role_assignments — 用户角色分配（支持多角色）
-- 3. role_permission_audit_logs — 权限变更审计日志
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL UNIQUE,
	"label" varchar(100) NOT NULL,
	"description" text,
	"permissions" bigint NOT NULL DEFAULT '0',
	"is_system" boolean NOT NULL DEFAULT false,
	"sort_order" integer NOT NULL DEFAULT 0,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_roles_name" ON "admin_roles" ("name");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_role_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"assigned_by" integer,
	"assigned_at" timestamp with time zone NOT NULL DEFAULT now(),
	"revoked_at" timestamp with time zone,
	CONSTRAINT "ura_unique_active" UNIQUE("user_id","role_id","revoked_at")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ura_user" ON "user_role_assignments" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ura_role" ON "user_role_assignments" ("role_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role_permission_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" varchar(30) NOT NULL,
	"operator_id" integer,
	"target_user_id" integer,
	"target_role_id" integer,
	"detail" text,
	"diff" text,
	"created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rpal_created" ON "role_permission_audit_logs" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rpal_action" ON "role_permission_audit_logs" ("action");
