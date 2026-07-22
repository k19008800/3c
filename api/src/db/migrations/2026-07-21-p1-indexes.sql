-- ============================================================
--  3cloud P1 性能索引迁移
--  执行时间：低峰期（凌晨）
--  创建方式：CONCURRENTLY 避免锁表
-- ============================================================

BEGIN;

-- ── 1. call_logs 按用户查询（用户中心日志列表）──
CREATE INDEX CONCURRENTLY IF NOT EXISTS call_logs_user_time_idx
ON call_logs (user_id, created_at DESC)
WHERE deleted_at IS NULL;

-- ── 2. commission_logs 按状态+时间（待结算列表）──
CREATE INDEX CONCURRENTLY IF NOT EXISTS comm_logs_status_time_idx
ON commission_logs (status, created_at DESC)
WHERE status IN ('pending', 'settled');

-- ── 3. api_keys 按用户+状态（用户 Key 列表）──
CREATE INDEX CONCURRENTLY IF NOT EXISTS api_keys_user_status_idx
ON api_keys (user_id, status, created_at DESC)
WHERE deleted_at IS NULL;

-- ── 4. agents 按状态+创建时间（代理商列表）──
CREATE INDEX CONCURRENTLY IF NOT EXISTS agents_status_created_idx
ON agents (status, created_at DESC)
WHERE deleted_at IS NULL;

-- ── 5. balance_logs 按用户+时间（用户余额流水）──
CREATE INDEX CONCURRENTLY IF NOT EXISTS balance_logs_user_time_idx
ON balance_logs (user_id, created_at DESC);

-- ── 6. recharge_orders 按状态+时间（待审核列表）──
CREATE INDEX CONCURRENTLY IF NOT EXISTS recharge_orders_status_time_idx
ON recharge_orders (status, created_at DESC)
WHERE status IN ('pending_first', 'pending_second');

-- ── 7. withdraw_orders 按状态+时间（待审核列表）──
CREATE INDEX CONCURRENTLY IF NOT EXISTS withdraw_orders_status_time_idx
ON withdraw_orders (status, created_at DESC)
WHERE status IN ('pending_first', 'pending_second');

-- ── 8. vendor_key_group_items 按状态+分组（路由决策）──
CREATE INDEX CONCURRENTLY IF NOT EXISTS vkg_items_status_group_idx
ON vendor_key_group_items (status, group_id, weight DESC)
WHERE deleted_at IS NULL AND status = true;

COMMIT;

-- ── 验证 ──
SELECT 
  schemaname, relname, indexname 
FROM pg_indexes 
WHERE indexname LIKE '%_status_%' 
   OR indexname LIKE '%_user_%'
   OR indexname LIKE '%_time_idx'
ORDER BY relname, indexname;
