-- ============================================================
--  3cloud (3C) — Migration: 账号注销系统
--  2026-07-27
--  新增表：account_deletion_requests, deletion_checklist
-- ============================================================

-- 1. 账号注销请求表
CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason            TEXT,
  status            VARCHAR(20) NOT NULL DEFAULT 'pending',
  cooling_deadline  TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  rejected_reason   TEXT,
  processed_by       INTEGER REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 一个用户同时只有一个活跃注销请求
CREATE UNIQUE INDEX IF NOT EXISTS adr_user_status_idx
  ON account_deletion_requests (user_id, status);

-- 加速冷却期到期扫描（定时任务用）
CREATE INDEX IF NOT EXISTS adr_cooling_deadline_idx
  ON account_deletion_requests (status, cooling_deadline)
  WHERE status = 'cooling';

-- 2. 注销检查项清单
CREATE TABLE IF NOT EXISTS deletion_checklist (
  id                SERIAL PRIMARY KEY,
  request_id         INTEGER NOT NULL REFERENCES account_deletion_requests(id) ON DELETE CASCADE,
  check_item         VARCHAR(50) NOT NULL,
  passed             VARCHAR(10) NOT NULL DEFAULT 'false',
  detail             TEXT,
  checked_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS dc_request_idx
  ON deletion_checklist (request_id, check_item);
