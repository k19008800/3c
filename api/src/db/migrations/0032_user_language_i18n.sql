-- 0032 users.language — i18n 用户语言偏好（Gate-1 / Gate-0 契约）
-- 按账号维度独立；值域过白名单（lib/i18n-langs.ts），默认 zh-CN。
-- 幂等（ADD COLUMN IF NOT EXISTS）：可安全重跑。
-- 遵循 0017+ 手工迁移惯例**不登记 meta/_journal.json** ，
-- 由 run-migration-0032.cjs 手工执行（与 run-migration-0031.cjs 同模式）。
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "language" varchar(10) DEFAULT 'zh-CN' NOT NULL;