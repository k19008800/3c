-- 客服支撑模块（§10）— 知识库 + 快捷回复
-- 对齐 docs/ref-10.2-knowledge-base.md + ref-10.4-quick-reply.md
-- 2026-08-02

CREATE TABLE IF NOT EXISTS knowledge_base_articles (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  category VARCHAR(100),
  content TEXT,
  tags TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  view_count INTEGER NOT NULL DEFAULT 0,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  unhelpful_count INTEGER NOT NULL DEFAULT 0,
  author_id INTEGER REFERENCES users(id),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kb_status ON knowledge_base_articles(status);
CREATE INDEX IF NOT EXISTS idx_kb_category ON knowledge_base_articles(category);
CREATE INDEX IF NOT EXISTS idx_kb_search ON knowledge_base_articles(title, tags);

CREATE TABLE IF NOT EXISTS knowledge_base_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_base_feedback (
  id SERIAL PRIMARY KEY,
  article_id INTEGER NOT NULL REFERENCES knowledge_base_articles(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  helpful BOOLEAN NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kb_feedback_article ON knowledge_base_feedback(article_id);

CREATE TABLE IF NOT EXISTS quick_reply_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50),
  content TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qr_category ON quick_reply_templates(category);
