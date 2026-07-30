-- ============================================================
--  3cloud (3C) — 代理商邀请裂变（§24.1）
--  Migration: 2026-07-30-agent-referral
--  创建 agent_referral_links 表 + users 表扩展
-- ============================================================

-- 1. 创建邀请链接表
CREATE TABLE IF NOT EXISTS agent_referral_links (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER NOT NULL REFERENCES users(id),
  code VARCHAR(20) NOT NULL UNIQUE,
  custom_name VARCHAR(100),
  click_count INTEGER DEFAULT 0,
  register_count INTEGER DEFAULT 0,
  source VARCHAR(50) DEFAULT 'direct',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. users 表扩展：被哪个代理邀请注册
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_agent INTEGER REFERENCES users(id);

-- 3. 索引
CREATE INDEX IF NOT EXISTS idx_agent_referral_links_agent_id ON agent_referral_links(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_referral_links_code ON agent_referral_links(code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by_agent ON users(referred_by_agent);