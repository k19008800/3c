-- ============================================================
--  3cloud (3C) — 操作类型管理表 (p2)
--  Migration: 2026-07-25-operation-types.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS operation_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  category VARCHAR(50) NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO operation_types (name, category, description) VALUES
('login', 'auth', '用户登录'),
('logout', 'auth', '用户登出'),
('password_change', 'auth', '修改密码'),
('key_create', 'api', '创建API密钥'),
('key_delete', 'api', '删除API密钥'),
('key_update', 'api', '更新API密钥'),
('recharge', 'finance', '充值'),
('withdraw', 'finance', '提现'),
('config_change', 'system', '系统配置变更'),
('user_delete', 'system', '删除用户')
ON CONFLICT (name) DO NOTHING;
