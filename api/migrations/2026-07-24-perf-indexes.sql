-- ============================================================
--  3cloud (3C) — 性能优化索引迁移
--  日期：2026-07-24
--  用途：添加全文搜索索引 + 补量查询优化索引
-- ============================================================

-- ── 1. 启用 pg_trgm 扩展（全文搜索支持）──
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── 2. 用户邮箱全文搜索索引（支持 ILIKE '%keyword%' 查询）──
-- 管理后台用户搜索：WHERE email ILIKE '%keyword%'
DROP INDEX IF EXISTS users_email_trgm_idx;
CREATE INDEX CONCURRENTLY users_email_trgm_idx ON users USING gin (email gin_trgm_ops);

-- ── 3. 用户昵称全文搜索索引 ──
DROP INDEX IF EXISTS users_nickname_trgm_idx;
CREATE INDEX CONCURRENTLY users_nickname_trgm_idx ON users USING gin (nickname gin_trgm_ops);

-- ── 4. call_logs 模型名全文搜索索引 ──
-- 管理后台日志搜索：WHERE model_name ILIKE '%keyword%'
DROP INDEX IF EXISTS call_logs_model_trgm_idx;
CREATE INDEX CONCURRENTLY call_logs_model_trgm_idx ON call_logs USING gin (model_name gin_trgm_ops);

-- ── 5. vendors 供应商名全文搜索索引 ──
DROP INDEX IF EXISTS vendors_name_trgm_idx;
CREATE INDEX CONCURRENTLY vendors_name_trgm_idx ON vendors USING gin (name gin_trgm_ops);

-- ── 6. audit_logs 操作详情索引 ──
-- 审计日志搜索优化
DROP INDEX IF EXISTS audit_logs_action_idx;
CREATE INDEX CONCURRENTLY audit_logs_action_idx ON audit_logs (action);

DROP INDEX IF EXISTS audit_logs_target_type_idx;
CREATE INDEX CONCURRENTLY audit_logs_target_type_idx ON audit_logs (target_type);

-- ── 7. balance_logs 复合索引 ──
-- 余额流水查询：WHERE user_id = ? ORDER BY created_at DESC
DROP INDEX IF EXISTS balance_logs_user_created_idx;
CREATE INDEX CONCURRENTLY balance_logs_user_created_idx ON balance_logs (user_id, created_at DESC);

-- ── 8. security_events 复合索引 ──
-- 安全事件查询：WHERE risk_level = ? AND created_at >= ?
DROP INDEX IF EXISTS security_events_risk_created_idx;
CREATE INDEX CONCURRENTLY security_events_risk_created_idx ON security_events (risk_level, created_at DESC);

-- ── 9. agent_clients 代理商索引 ──
-- 代理商列表查询优化
DROP INDEX IF EXISTS agent_clients_parent_idx;
CREATE INDEX CONCURRENTLY agent_clients_parent_idx ON agent_clients (parent_id);

DROP INDEX IF EXISTS agent_clients_status_idx;
CREATE INDEX CONCURRENTLY agent_clients_status_idx ON agent_clients (status);

-- ── 10. redemption_orders 兑换订单索引 ──
-- 兑换订单查询：WHERE status = ? AND created_at >= ?
DROP INDEX IF EXISTS redemption_orders_status_created_idx;
CREATE INDEX CONCURRENTLY redemption_orders_status_created_idx ON redemption_orders (status, created_at DESC);

-- ── 验证索引创建 ──
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE indexname LIKE '%trgm%' OR indexname IN (
  'audit_logs_action_idx',
  'audit_logs_target_type_idx',
  'balance_logs_user_created_idx',
  'security_events_risk_created_idx',
  'agent_clients_parent_idx',
  'agent_clients_status_idx',
  'redemption_orders_status_created_idx'
)
ORDER BY tablename, indexname;
