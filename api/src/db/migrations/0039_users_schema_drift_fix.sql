-- 0039 schema 漂移修复：users 表补列（customer_type / real_name_status / is_contract）
-- 背景：schema（users.ts）与 meta snapshot 自 0003 起含这三列，但此前所有迁移 SQL 均未
--       添加（本地库经 db:push 生成，生产按迁移建库则缺失）→ seed/业务插入报 42703。
-- 幂等：ADD COLUMN IF NOT EXISTS，任何环境重复执行安全。
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "customer_type" varchar(20) DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "real_name_status" varchar(20) DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_contract" boolean DEFAULT false NOT NULL;--> statement-breakpoint
