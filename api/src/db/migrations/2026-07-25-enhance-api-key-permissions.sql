-- 3cloud API Key 增强权限字段迁移
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS daily_usage NUMERIC(18,6) DEFAULT 0;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS monthly_usage NUMERIC(18,6) DEFAULT 0;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS last_reset_daily TIMESTAMPTZ;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS last_reset_monthly TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS api_key_usage_stats (
    id SERIAL PRIMARY KEY,
    api_key_id INTEGER NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    calls INTEGER NOT NULL DEFAULT 0,
    tokens BIGINT NOT NULL DEFAULT 0,
    cost NUMERIC(18,6) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_key_usage_stats_api_key_id_date_idx ON api_key_usage_stats(api_key_id, date);
CREATE INDEX IF NOT EXISTS api_key_usage_stats_date_idx ON api_key_usage_stats(date);
