-- ============================================================
--  3cloud (3C) — Webhook 事件投递日志表
--  Migration: 2026-07-30-webhook-logs
--  创建 webhook_event_logs 表，持久化 Webhook 投递记录
-- ============================================================

CREATE TABLE IF NOT EXISTS webhook_event_logs (
  id SERIAL PRIMARY KEY,
  webhook_id INTEGER NOT NULL REFERENCES global_webhooks(id) ON DELETE CASCADE,
  event VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending / success / failed
  status_code INTEGER,
  request_body JSONB,
  response_body TEXT,
  attempt INTEGER NOT NULL DEFAULT 1,
  max_retries INTEGER NOT NULL DEFAULT 3,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  retried_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhook_event_logs_webhook_id ON webhook_event_logs(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_event_logs_status ON webhook_event_logs(status);
CREATE INDEX IF NOT EXISTS idx_webhook_event_logs_created_at ON webhook_event_logs(created_at);