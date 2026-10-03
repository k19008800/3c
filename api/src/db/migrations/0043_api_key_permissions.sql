-- 0043 Key 细粒度权限：api_keys 扩列（§20.4 Key 细粒度权限，P0）
-- 7 个 nullable 列：数组列 NULL/空 = 不限制（向后兼容，未配置的 Key 全部放通）。
-- 幂等：ADD COLUMN IF NOT EXISTS。

ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "allowed_models" text[];--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "blocked_models" text[];--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "allowed_ips" text[];--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "allowed_referers" text[];--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "daily_token_limit" integer;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "rpm_limit" integer;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "tpm_limit" integer;
