-- ============================================================
--  3cloud (3C) — 配置版本控制迁移
-- ============================================================

-- 创建 config_versions 表
CREATE TABLE IF NOT EXISTS config_versions (
  id SERIAL PRIMARY KEY,
  config_key VARCHAR(100) NOT NULL,
  config_type VARCHAR(50) NOT NULL DEFAULT 'system',
  old_value TEXT,
  new_value TEXT NOT NULL,
  changed_by INTEGER REFERENCES users(id),
  change_reason TEXT,
  ip VARCHAR(45),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS config_versions_key_idx ON config_versions(config_key);
CREATE INDEX IF NOT EXISTS config_versions_type_idx ON config_versions(config_type);
CREATE INDEX IF NOT EXISTS config_versions_created_at_idx ON config_versions(created_at);
CREATE INDEX IF NOT EXISTS config_versions_key_type_time_idx ON config_versions(config_key, config_type, created_at DESC);

-- 添加注释
COMMENT ON TABLE config_versions IS '配置版本历史记录';
COMMENT ON COLUMN config_versions.id IS '版本 ID';
COMMENT ON COLUMN config_versions.config_key IS '配置键';
COMMENT ON COLUMN config_versions.config_type IS '配置类型：system | security | login_security';
COMMENT ON COLUMN config_versions.old_value IS '旧值（JSON）';
COMMENT ON COLUMN config_versions.new_value IS '新值（JSON）';
COMMENT ON COLUMN config_versions.changed_by IS '操作者 ID';
COMMENT ON COLUMN config_versions.change_reason IS '变更原因';
COMMENT ON COLUMN config_versions.ip IS '操作者 IP';
COMMENT ON COLUMN config_versions.created_at IS '创建时间';
