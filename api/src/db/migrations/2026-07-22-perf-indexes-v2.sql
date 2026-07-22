-- ============================================================
-- 3cloud 性能优化索引迁移（修复版 v2）
-- 日期: 2026-07-22
-- 目的: 添加 P0 缺失索引，消除全表扫描
-- 修复: 分区表索引需要在父表上创建（会自动传播到分区）
-- ============================================================

-- 1. vendor_key_group_items 路由筛选索引（P0-D3）
CREATE INDEX CONCURRENTLY IF NOT EXISTS kg_items_route_idx
ON vendor_key_group_items (status, is_down)
WHERE status = true AND is_down = false;

-- 2. balance_logs ref 索引（P0-D4）
CREATE INDEX CONCURRENTLY IF NOT EXISTS balance_logs_ref_idx
ON balance_logs (ref_type, ref_id);

-- 3. agent_balance_ledger ref 索引（P1-D13）
CREATE INDEX CONCURRENTLY IF NOT EXISTS abl_ref_idx
ON agent_balance_ledger (ref_type, ref_id)
WHERE ref_id IS NOT NULL;

-- 4. user_login_history IP 索引（P1-D14）
CREATE INDEX CONCURRENTLY IF NOT EXISTS user_login_history_ip_idx
ON user_login_history (ip, created_at DESC);

-- 5. redemption_logs batch_id 索引（P1-D11）
CREATE INDEX CONCURRENTLY IF NOT EXISTS redeem_logs_batch_idx
ON redemption_logs (batch_id);

-- 6. agent_customer_consumption customer_user_id 索引（P1-D10）
CREATE INDEX CONCURRENTLY IF NOT EXISTS agent_consumption_customer_idx
ON agent_customer_consumption (customer_user_id);

-- ============================================================
-- 分区表索引（commission_logs, call_logs）
-- PostgreSQL 分区表：在父表上创建索引会自动传播到所有分区
-- 但 CONCURRENTLY 不支持，需要不带 CONCURRENTLY 创建
-- ============================================================

-- 7. commission_logs client_call_log_id 索引（P0-D5）
-- 分区表不支持 CONCURRENTLY，使用普通 CREATE INDEX
CREATE INDEX IF NOT EXISTS comm_logs_client_call_idx
ON commission_logs (client_call_log_id)
WHERE client_call_log_id IS NOT NULL;

-- 8. call_logs key_group_item_id 索引（P1-D8）
CREATE INDEX IF NOT EXISTS call_logs_key_item_idx
ON call_logs (key_group_item_id, price_source)
WHERE key_group_item_id IS NOT NULL;

-- ============================================================
-- ANALYZE 更新统计信息
-- ============================================================
ANALYZE vendor_key_group_items;
ANALYZE balance_logs;
ANALYZE commission_logs;
ANALYZE call_logs;
ANALYZE agent_balance_ledger;
ANALYZE user_login_history;
ANALYZE redemption_logs;
ANALYZE agent_customer_consumption;
