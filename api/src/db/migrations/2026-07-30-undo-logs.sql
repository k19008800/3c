-- ============================================================
--  3cloud (3C) — 撤销操作日志表（Undo Logs）
--  Migration: 2026-07-30-undo-logs
--  创建 undo_logs 表，持久化撤销操作记录
-- ============================================================

CREATE TABLE IF NOT EXISTS undo_logs (
  id SERIAL PRIMARY KEY,
  token VARCHAR(36) NOT NULL UNIQUE,
  action VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id INTEGER NOT NULL,
  operator_id INTEGER NOT NULL REFERENCES users(id),
  before_data JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending / undone / expired
  undone_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_undo_logs_operator_id ON undo_logs(operator_id);
CREATE INDEX IF NOT EXISTS idx_undo_logs_created_at ON undo_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_undo_logs_status ON undo_logs(status);