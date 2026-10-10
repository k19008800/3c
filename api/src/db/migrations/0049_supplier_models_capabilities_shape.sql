-- 0049_supplier_models_capabilities_shape.sql
--
-- 背景（FIX-5 / REGRESSION-2026-10-10）：
--   supplier_models.capabilities 是 jsonb 列，但写入口 /admin/models/:id 未做形状校验，
--   对象/字符串等非数组值可直接落库。读侧 deriveMultimodalType() 假定为数组并 .join()，
--   导致 GET /api/v1/admin/multimodal-models 抛
--   TypeError: (capabilities ?? []).join is not a function → 整页 500。
--   即单条脏数据即可打挂整个多模态模型管理页。
--
-- 本迁移做两件事（均幂等，可重复执行）：
--   1) 清理历史脏数据：非数组值归一为空数组 []
--   2) 加 CHECK 约束，阻止任何非数组形状再次写入（从数据库层兜底）
--
-- 注：应用层校验见 api/src/routes/suppliers.ts（PUT /admin/models/:id）；
--     本约束为第二道防线，覆盖未来新增的其它写入路径。

-- 1) 归一历史脏数据：非数组 → []
DO $$
DECLARE
  fixed_count integer;
BEGIN
  UPDATE supplier_models
  SET capabilities = '[]'::jsonb, updated_at = now()
  WHERE capabilities IS NOT NULL
    AND jsonb_typeof(capabilities) <> 'array';

  GET DIAGNOSTICS fixed_count = ROW_COUNT;
  IF fixed_count > 0 THEN
    RAISE NOTICE '已清理 supplier_models 非数组 capabilities 共 % 行', fixed_count;
  END IF;
END $$;

-- 2) 约束：只允许数组（或 NULL）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supplier_models_capabilities_is_array'
  ) THEN
    ALTER TABLE supplier_models
      ADD CONSTRAINT supplier_models_capabilities_is_array
      CHECK (capabilities IS NULL OR jsonb_typeof(capabilities) = 'array');
    RAISE NOTICE '已添加约束 supplier_models_capabilities_is_array';
  END IF;
END $$;
