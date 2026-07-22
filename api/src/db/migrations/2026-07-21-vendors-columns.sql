-- ============================================================
--  vendors 表新增 deleted_at 和 notes 字段
--  日期: 2026-07-21
-- ============================================================

BEGIN;

-- 添加 deleted_at 字段（软删除标记）
ALTER TABLE vendors 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- 添加 notes 字段（内部备注）
ALTER TABLE vendors 
ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;

-- 添加索引（软删除查询优化）
CREATE INDEX IF NOT EXISTS vendors_deleted_at_idx 
ON vendors (deleted_at) 
WHERE deleted_at IS NOT NULL;

COMMIT;

-- 验证
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'vendors' 
  AND column_name IN ('deleted_at', 'notes');
