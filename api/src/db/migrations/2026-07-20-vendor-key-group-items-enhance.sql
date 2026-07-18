-- ============================================================
--  3cloud (3C) — 供应商 Key 分组增强字段
--  迁移 2026-07-20-vendor-key-group-items-enhance
--  新增：notes（备注）、deleted_at（软删除）
-- ============================================================

ALTER TABLE vendor_key_group_items
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
