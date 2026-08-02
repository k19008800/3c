-- §22.1 Onboarding 新用户引导
-- 对应 docs/SPEC-§22-用户端体验增强.md §22.1

ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_status VARCHAR(20) DEFAULT 'not_started';
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_onboarding_status ON users(onboarding_status) WHERE onboarding_status != 'completed';
