-- ============================================================
--  3cloud (3C) — Key-Model 交叉价格表
--  允许同一分组内不同 Key 对不同模型有专属折扣
--  场景：Key A → V4-Pro 7折, V4-Flash 9折
--         Key B → V4-Pro 原价, V4-Flash 8折
-- ============================================================

-- 1. 创建 vendor_key_group_model_prices 交叉表
CREATE TABLE IF NOT EXISTS vendor_key_group_model_prices (
  id SERIAL PRIMARY KEY,
  key_group_item_id INTEGER NOT NULL REFERENCES vendor_key_group_items(id) ON DELETE CASCADE,
  vendor_model_id INTEGER NOT NULL REFERENCES vendor_models(id) ON DELETE CASCADE,
  -- 折扣类型：percent = 百分比（如 0.7 即打 7 折）, absolute = 固定价
  type VARCHAR(10) NOT NULL DEFAULT 'percent',
  -- 输入 token 价格覆盖
  input_value NUMERIC(18,6),
  -- 输出 token 价格覆盖
  output_value NUMERIC(18,6),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  -- 同一 Key + 模型组合唯一
  UNIQUE(key_group_item_id, vendor_model_id)
);

-- 2. 索引
CREATE INDEX IF NOT EXISTS idx_key_group_model_prices_item
  ON vendor_key_group_model_prices(key_group_item_id);
CREATE INDEX IF NOT EXISTS idx_key_group_model_prices_model
  ON vendor_key_group_model_prices(vendor_model_id);

-- 3. call_logs 补充字段：记录最终生效的定价源
ALTER TABLE call_logs
  ADD COLUMN IF NOT EXISTS price_source VARCHAR(20),
  ADD COLUMN IF NOT EXISTS price_source_id INTEGER,
  ADD COLUMN IF NOT EXISTS discount_type VARCHAR(10);
