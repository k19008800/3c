-- ============================================================
--  3cloud (3C) — 操作类型管理表
--  Migration: 20260725_add_operation_types.sql
-- ============================================================

-- ── 操作类型表 ──
CREATE TABLE IF NOT EXISTS operation_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  category operation_category NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 索引 ──
CREATE INDEX IF NOT EXISTS operation_types_category_idx ON operation_types(category);
CREATE INDEX IF NOT EXISTS operation_types_enabled_idx ON operation_types(enabled);

-- ── 注释 ──
COMMENT ON TABLE operation_types IS '操作类型管理表（审计日志操作类型）';
COMMENT ON COLUMN operation_types.name IS '操作类型名称（唯一）';
COMMENT ON COLUMN operation_types.category IS '分类：auth/api_key/finance/profile/agent/system';
COMMENT ON COLUMN operation_types.description IS '描述说明';
COMMENT ON COLUMN operation_types.enabled IS '是否启用';
COMMENT ON COLUMN operation_types.is_system IS '是否系统内置（不可删除）';
COMMENT ON COLUMN operation_types.created_by IS '创建人 ID';
COMMENT ON COLUMN operation_types.created_at IS '创建时间';
COMMENT ON COLUMN operation_types.updated_at IS '更新时间';
