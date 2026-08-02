-- 账号注销模块（Sprint 1）
-- 对齐 docs/sprint-1/01-account-deletion-overview.md §2
-- 2026-08-02

-- 注销请求表
CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  cooling_deadline TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  rejected_reason TEXT,
  processed_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_deletion_user_status ON account_deletion_requests(user_id, status) WHERE status IN ('pending', 'cooling');
CREATE INDEX IF NOT EXISTS idx_deletion_cooling_expiry ON account_deletion_requests(status, cooling_deadline) WHERE status = 'cooling';

-- 注销检查清单表
CREATE TABLE IF NOT EXISTS deletion_checklist (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES account_deletion_requests(id) ON DELETE CASCADE,
  check_item VARCHAR(50) NOT NULL,
  passed VARCHAR(10) NOT NULL DEFAULT 'false',
  detail TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_request_item ON deletion_checklist(request_id, check_item);
