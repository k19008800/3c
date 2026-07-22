-- ============================================================
-- 2026-07-22: 提示词审计日志 + 敏感词库
-- ============================================================

-- ── 新增枚举 ──

CREATE TYPE audit_status AS ENUM ('pending', 'reviewed', 'flagged', 'ignored');
CREATE TYPE response_status AS ENUM ('success', 'error', 'filtered', 'timeout');

-- ── 敏感词库 ──

CREATE TABLE sensitive_words (
  id SERIAL PRIMARY KEY,
  word VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  severity VARCHAR(20) NOT NULL DEFAULT 'medium',
  description TEXT,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX sensitive_words_word_idx ON sensitive_words(word);
CREATE INDEX sensitive_words_category_idx ON sensitive_words(category);
CREATE INDEX sensitive_words_enabled_idx ON sensitive_words(enabled);

-- ── 提示词审计日志 ──

CREATE TABLE prompt_audit_logs (
  id SERIAL PRIMARY KEY,
  call_log_id INTEGER,
  call_log_created_at TIMESTAMPTZ,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  api_key_id INTEGER REFERENCES api_keys(id) ON DELETE SET NULL,
  model_name VARCHAR(100),
  prompt TEXT NOT NULL,
  prompt_hash VARCHAR(64) NOT NULL,
  response_summary TEXT,
  response_status response_status NOT NULL DEFAULT 'success',
  is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
  sensitive_words TEXT[],
  audit_status audit_status NOT NULL DEFAULT 'pending',
  audited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  audited_at TIMESTAMPTZ,
  flag_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX prompt_audit_user_idx ON prompt_audit_logs(user_id);
CREATE INDEX prompt_audit_api_key_idx ON prompt_audit_logs(api_key_id);
CREATE INDEX prompt_audit_model_idx ON prompt_audit_logs(model_name);
CREATE INDEX prompt_audit_hash_idx ON prompt_audit_logs(prompt_hash);
CREATE INDEX prompt_audit_sensitive_idx ON prompt_audit_logs(is_sensitive);
CREATE INDEX prompt_audit_status_idx ON prompt_audit_logs(audit_status);
CREATE INDEX prompt_audit_created_idx ON prompt_audit_logs(created_at);

-- ── 注释 ──

COMMENT ON TABLE sensitive_words IS '敏感词库';
COMMENT ON TABLE prompt_audit_logs IS '提示词审计日志';

COMMENT ON COLUMN prompt_audit_logs.call_log_id IS '关联调用记录 ID（call_logs 分区表，无 FK）';
COMMENT ON COLUMN prompt_audit_logs.call_log_created_at IS '调用记录创建时间（联合 call_log_id 定位分区）';
COMMENT ON COLUMN prompt_audit_logs.prompt_hash IS 'SHA256 哈希，用于去重查询';
COMMENT ON COLUMN prompt_audit_logs.response_summary IS '响应摘要（前 500 字）';
COMMENT ON COLUMN prompt_audit_logs.is_sensitive IS '是否命中敏感词';
COMMENT ON COLUMN prompt_audit_logs.sensitive_words IS '命中的敏感词列表';
