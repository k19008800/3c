-- 3cloud API Key 权限字段迁移
-- 向 api_keys 表添加 permissions 和 template_id 字段
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS permissions JSONB;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS template_id INTEGER;
CREATE INDEX IF NOT EXISTS api_keys_template_idx ON api_keys(template_id);
