-- ============================================================
--  3cloud P2 性能优化迁移
--  外键约束 + 索引优化
-- ============================================================

BEGIN;

-- ── 1. 添加外键约束（数据完整性）──
-- 注意：添加外键前需确保数据一致性

-- commission_logs.agent_id → agents.id
ALTER TABLE commission_logs 
ADD CONSTRAINT fk_comm_logs_agent 
FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT;

-- commission_logs.call_log_id → call_logs.id
ALTER TABLE commission_logs 
ADD CONSTRAINT fk_comm_logs_call 
FOREIGN KEY (call_log_id) REFERENCES call_logs(id) ON DELETE SET NULL;

-- api_keys.user_id → users.id
ALTER TABLE api_keys 
ADD CONSTRAINT fk_api_keys_user 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- balance_logs.user_id → users.id
ALTER TABLE balance_logs 
ADD CONSTRAINT fk_balance_logs_user 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- ── 2. 添加复合索引（查询优化）──

-- 用户通知按类型查询
CREATE INDEX CONCURRENTLY IF NOT EXISTS user_notifications_type_user_idx
ON user_notifications (type, user_id, created_at DESC)
WHERE is_read = false;

-- 代理商客户消费查询
CREATE INDEX CONCURRENTLY IF NOT EXISTS agent_cust_cons_user_idx
ON agent_customer_consumption (customer_user_id, consumed_at DESC);

-- 兑换码日志按批次查询
CREATE INDEX CONCURRENTLY IF NOT EXISTS redemption_logs_batch_idx
ON redemption_logs (batch_id, created_at DESC);

-- 审计日志按操作类型
CREATE INDEX CONCURRENTLY IF NOT EXISTS audit_logs_action_time_idx
ON audit_logs (action, created_at DESC);

-- ── 3. 移除冗余索引（如有）──
-- 检查并删除被复合索引覆盖的单列索引
-- 示例：如果存在 (user_id, created_at) 则 user_id 单列索引可能冗余

-- ── 4. 统一金额字段类型（可选，需数据迁移）──
-- 注意：此操作需要停机维护
-- ALTER TABLE campaigns ALTER COLUMN budget TYPE numeric(18,6);
-- ALTER TABLE finance_cost ALTER COLUMN amount TYPE numeric(18,6);

COMMIT;

-- ── 验证 ──
SELECT 
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type
FROM information_schema.table_constraints tc
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;
