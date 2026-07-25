-- ============================================================
-- 3cloud (3C) — 公告定时发布字段迁移
-- 添加 scheduled_at 和 is_published 字段
-- ============================================================

-- 添加定时发布时间字段（nullable timestamp）
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE;

-- 添加是否已发布字段（boolean，默认 true 保持兼容性）
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT TRUE;

-- 为定时发布查询添加索引
CREATE INDEX IF NOT EXISTS announcements_scheduled_publish_idx ON announcements (scheduled_at) WHERE scheduled_at IS NOT NULL AND is_published = FALSE;

-- 将现有公告标记为已发布（兼容现有数据）
UPDATE announcements SET is_published = TRUE WHERE is_published IS NULL;

COMMENT ON COLUMN announcements.scheduled_at IS '定时发布时间，NULL 表示立即发布';
COMMENT ON COLUMN announcements.is_published IS '是否已发布，定时发布时在 scheduled_at 到期后自动设置为 TRUE';
