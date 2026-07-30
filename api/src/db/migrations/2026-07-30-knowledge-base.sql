-- ============================================================
--  3cloud (3C) — Migration 0008: 知识库系统（§10.2）
--  新建表：knowledge_categories + knowledge_base
--  接续 migration 0007 (2026-07-30-tickets-and-chat.sql)
-- ============================================================

-- 知识库分类
CREATE TABLE IF NOT EXISTS knowledge_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 知识库文章
CREATE TABLE IF NOT EXISTS knowledge_base (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  summary VARCHAR(500),
  category_id INTEGER REFERENCES knowledge_categories(id) ON DELETE SET NULL,
  tags TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',  -- draft | published | archived
  author_id INTEGER NOT NULL,
  view_count INTEGER NOT NULL DEFAULT 0,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  published_at TIMESTAMP
);

-- 索引
CREATE INDEX idx_knowledge_category ON knowledge_base(category_id);
CREATE INDEX idx_knowledge_status ON knowledge_base(status);
CREATE INDEX idx_knowledge_published_at ON knowledge_base(published_at) WHERE status = 'published';
CREATE INDEX idx_knowledge_categories_slug ON knowledge_categories(slug);