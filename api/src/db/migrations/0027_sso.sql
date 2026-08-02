-- SSO 单点登录配置（§32.2）
-- 对齐 docs/ref-32-sso-integration.md

CREATE TABLE IF NOT EXISTS sso_configs (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(30) NOT NULL UNIQUE,
  label VARCHAR(50) DEFAULT 'SSO',
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  config TEXT NOT NULL,
  forced_domains TEXT,
  default_role VARCHAR(50),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sso_provider ON sso_configs(provider);

-- 企业通讯录 OAuth 配置（§32.3）

CREATE TABLE IF NOT EXISTS enterprise_oauth_configs (
  id SERIAL PRIMARY KEY,
  platform VARCHAR(20) NOT NULL UNIQUE,
  label VARCHAR(50),
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  config TEXT NOT NULL,
  auto_create_user BOOLEAN NOT NULL DEFAULT TRUE,
  default_role VARCHAR(50),
  sync_contacts BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_enterprise_oauth_platform ON enterprise_oauth_configs(platform);
