-- ============================================================
--  3cloud (3C) — 上游 Key 分组管理
--  迁移 2026-07-20-vendor-key-groups
-- ============================================================

-- 1. 创建 vendor_key_groups 表
CREATE TABLE IF NOT EXISTS vendor_key_groups (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  strategy VARCHAR(20) NOT NULL DEFAULT 'round_robin',
  description TEXT,
  status BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. 创建 vendor_key_group_items 表
CREATE TABLE IF NOT EXISTS vendor_key_group_items (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES vendor_key_groups(id) ON DELETE CASCADE,
  api_key_encrypted TEXT NOT NULL,
  api_key_prefix VARCHAR(12),
  weight INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  status BOOLEAN NOT NULL DEFAULT true,
  is_down BOOLEAN NOT NULL DEFAULT false,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMP,
  total_calls INTEGER NOT NULL DEFAULT 0,
  success_calls INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. 索引
CREATE INDEX IF NOT EXISTS idx_key_groups_vendor ON vendor_key_groups(vendor_id);
CREATE INDEX IF NOT EXISTS idx_key_group_items_group ON vendor_key_group_items(group_id);

-- 4. vendor_models 表新增 key_group_id 字段
ALTER TABLE vendor_models ADD COLUMN IF NOT EXISTS key_group_id INTEGER REFERENCES vendor_key_groups(id);

-- 5. 迁移现有数据：为每个有 api_key_encrypted 的 vendor_model 创建默认分组
INSERT INTO vendor_key_groups (vendor_id, name, strategy, description)
SELECT DISTINCT vm.vendor_id, v.name || ' 默认分组', 'round_robin', '自动迁移的默认分组'
FROM vendor_models vm
JOIN vendors v ON v.id = vm.vendor_id
WHERE vm.api_key_encrypted IS NOT NULL
  AND vm.api_key_encrypted != ''
  AND NOT EXISTS (
    SELECT 1 FROM vendor_key_groups g WHERE g.vendor_id = vm.vendor_id
  );

INSERT INTO vendor_key_group_items (group_id, api_key_encrypted, api_key_prefix, weight)
SELECT g.id, vm.api_key_encrypted, LEFT(vm.api_key_encrypted, 7) || '...', 1
FROM vendor_models vm
JOIN vendor_key_groups g ON g.vendor_id = vm.vendor_id
WHERE vm.api_key_encrypted IS NOT NULL
  AND vm.api_key_encrypted != '';

UPDATE vendor_models vm
SET key_group_id = g.id
FROM vendor_key_groups g
WHERE g.vendor_id = vm.vendor_id
  AND vm.api_key_encrypted IS NOT NULL
  AND vm.api_key_encrypted != '';
