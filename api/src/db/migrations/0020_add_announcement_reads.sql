-- ============================================================
--  3cloud (3C) — 公告阅读记录表
--  用于追踪用户对公告的已读/未读状态
-- ============================================================

-- 创建公告阅读记录表
CREATE TABLE IF NOT EXISTS announcement_reads (
  id SERIAL PRIMARY KEY,
  announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT announcement_reads_user_announcement_unique UNIQUE (user_id, announcement_id)
);

-- 创建索引以优化查询性能
CREATE INDEX IF NOT EXISTS announcement_reads_user_id_idx ON announcement_reads(user_id);
CREATE INDEX IF NOT EXISTS announcement_reads_announcement_id_idx ON announcement_reads(announcement_id);

-- 注释
COMMENT ON TABLE announcement_reads IS '公告阅读记录：追踪用户对公告的已读状态';
COMMENT ON COLUMN announcement_reads.announcement_id IS '公告ID';
COMMENT ON COLUMN announcement_reads.user_id IS '用户ID';
COMMENT ON COLUMN announcement_reads.read_at IS '阅读时间';
