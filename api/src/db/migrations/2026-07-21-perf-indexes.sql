-- ============================================================
-- 3cloud 性能优化索引迁移
-- 日期: 2026-07-21
-- 目的: 添加 P0 缺失索引，消除全表扫描
-- ============================================================

-- 1. vendor_key_group_items 路由筛选索引（P0-D3）
-- 每次路由决策都查询 status=true AND is_down=false 的条目
CREATE INDEX CONCURRENTLY IF NOT EXISTS kg_items_route_idx
ON vendor_key_group_items (status, is_down)
WHERE status = true AND is_down = false;

-- 2. balance_logs ref 索引（P0-D4）
-- 退款/审计追踪需要按 ref_type + ref_id 定位流水
CREATE INDEX CONCURRENTLY IF NOT EXISTS balance_logs_ref_idx
ON balance_logs (ref_type, ref_id);

-- 3. commission_logs client_call_log_id 索引（P0-D5）
-- 按 call 定位佣金记录
CREATE INDEX CONCURRENTLY IF NOT EXISTS comm_logs_client_call_idx
ON commission_logs (client_call_log_id)
WHERE client_call_log_id IS NOT NULL;

-- 4. call_logs key_group_item_id 索引（P1-D8）
-- Key 定价溯源查询
CREATE INDEX CONCURRENTLY IF NOT EXISTS call_logs_key_item_idx
ON call_logs (key_group_item_id, price_source)
WHERE key_group_item_id IS NOT NULL;

-- 5. filter_logs 外键索引（P1-D12）
-- 按 call/user/key 反向排查过滤命中
-- 注：filter_logs 表不存在，跳过
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS filter_logs_call_idx
-- ON filter_logs (call_log_id)
-- WHERE call_log_id IS NOT NULL;

-- CREATE INDEX CONCURRENTLY IF NOT EXISTS filter_logs_user_idx
-- ON filter_logs (user_id);

-- CREATE INDEX CONCURRENTLY IF NOT EXISTS filter_logs_key_idx
-- ON filter_logs (api_key_id)
-- WHERE api_key_id IS NOT NULL;

-- 6. agent_balance_ledger ref 索引（P1-D13）
-- 审计追踪
CREATE INDEX CONCURRENTLY IF NOT EXISTS abl_ref_idx
ON agent_balance_ledger (ref_type, ref_id)
WHERE ref_id IS NOT NULL;

-- 7. user_login_history IP 索引（P1-D14）
-- 安全风控 IP 登录频率分析
CREATE INDEX CONCURRENTLY IF NOT EXISTS user_login_history_ip_idx
ON user_login_history (ip, created_at DESC);

-- 8. redemption_logs batch_id 索引（P1-D11）
-- 批次级统计查询
CREATE INDEX CONCURRENTLY IF NOT EXISTS redeem_logs_batch_idx
ON redemption_logs (batch_id);

-- 9. agent_customer_consumption customer_user_id 索引（P1-D10）
-- 查某用户所有代理关系
CREATE INDEX CONCURRENTLY IF NOT EXISTS agent_consumption_customer_idx
ON agent_customer_consumption (customer_user_id);

-- ============================================================
-- 完成提示
-- ============================================================
-- 索引创建完成后，建议执行 ANALYZE 更新统计信息:
-- ANALYZE vendor_key_group_items;
-- ANALYZE balance_logs;
-- ANALYZE commission_logs;
-- ANALYZE call_logs;
-- ANALYZE filter_logs;
-- ANALYZE agent_balance_ledger;
-- ANALYZE user_login_history;
-- ANALYZE redemption_logs;
-- ANALYZE agent_customer_consumption;
