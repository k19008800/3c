-- ============================================================
--  3cloud (3C) — 快捷回复模板（§10.4）
--  Migration: 2026-07-30-quick-reply-templates
-- ============================================================

-- 快捷回复分类
CREATE TABLE IF NOT EXISTS qrt_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  icon VARCHAR(20),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 快捷回复模板
CREATE TABLE IF NOT EXISTS quick_reply_templates (
  id SERIAL PRIMARY KEY,
  title VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  category_id INTEGER REFERENCES qrt_categories(id) ON DELETE SET NULL,
  scope VARCHAR(20) NOT NULL DEFAULT 'personal',  -- personal / team / global
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  team_id INTEGER,
  is_pinned BOOLEAN DEFAULT FALSE,
  use_count INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_qrt_scope ON quick_reply_templates(scope);
CREATE INDEX IF NOT EXISTS idx_qrt_owner_id ON quick_reply_templates(owner_id);
CREATE INDEX IF NOT EXISTS idx_qrt_category_id ON quick_reply_templates(category_id);
CREATE INDEX IF NOT EXISTS idx_qrt_pinned ON quick_reply_templates(is_pinned) WHERE is_pinned = TRUE;