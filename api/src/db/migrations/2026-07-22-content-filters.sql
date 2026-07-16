-- ============================================================
--  3cloud (3C) — 内容安全过滤
--  迁移 2026-07-22-content-filters
-- ============================================================

-- 1. 过滤规则表
CREATE TABLE IF NOT EXISTS content_filters (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  stage VARCHAR(20) NOT NULL DEFAULT 'pre_request',
  scope VARCHAR(20) NOT NULL DEFAULT 'request_body',
  match_type VARCHAR(20) NOT NULL DEFAULT 'keyword',
  pattern TEXT NOT NULL,
  action VARCHAR(20) NOT NULL DEFAULT 'block',
  replacement TEXT,
  apply_to VARCHAR(10)[] NOT NULL DEFAULT ARRAY['all'],
  priority INTEGER NOT NULL DEFAULT 100,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMP,
  status BOOLEAN NOT NULL DEFAULT true,
  created_by INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. 过滤日志表
CREATE TABLE IF NOT EXISTS filter_logs (
  id SERIAL PRIMARY KEY,
  filter_id INTEGER NOT NULL REFERENCES content_filters(id),
  call_log_id INTEGER,
  user_id INTEGER,
  api_key_id INTEGER,
  action VARCHAR(20) NOT NULL,
  match_content TEXT,
  matched_pattern TEXT,
  stage VARCHAR(20) NOT NULL,
  request_summary TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. 索引
CREATE INDEX IF NOT EXISTS idx_content_filters_status ON content_filters(status);
CREATE INDEX IF NOT EXISTS idx_filter_logs_created ON filter_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_filter_logs_filter ON filter_logs(filter_id);
