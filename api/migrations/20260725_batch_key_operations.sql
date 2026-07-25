-- ============================================================
--  3cloud (3C) — API Key 批量操作枚举迁移
--  添加批量操作相关的审计日志 action 类型
-- ============================================================

-- 添加新的审计 action 类型
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'batch_disable';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'batch_enable';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'batch_rate_limit';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'batch_assign_user';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'batch_export';

-- 注意：PostgreSQL 不支持在事务中执行 ALTER TYPE ADD VALUE
-- 如果需要回滚，需要手动删除这些值或重建枚举类型
