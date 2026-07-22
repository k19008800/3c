-- ============================================================
-- 3cloud 日志表 TTL 清理策略
-- 日期: 2026-07-21
-- 目的: 防止日志表无限膨胀，自动清理过期数据
-- ============================================================

-- 1. call_logs 分区自动清理（保留 6 个月在线）
-- 每月执行一次，删除 7 个月前的分区
-- Cron: 0 2 1 * * (每月1号凌晨2点执行)
-- 
-- 示例: 删除 2025-12 分区
-- DROP TABLE IF EXISTS call_logs_202512 CASCADE;

-- 推荐使用 DETACH + 归档而非直接 DROP:
-- ALTER TABLE call_logs DETACH PARTITION call_logs_202512;
-- 然后将 call_logs_202512 导出到冷存储 (S3/OSS)

-- 2. commission_logs 分区自动清理（保留 12 个月）
-- 同上，每月执行

-- 3. operation_logs 清理（保留 90 天）
-- 创建清理函数
CREATE OR REPLACE FUNCTION cleanup_operation_logs() RETURNS void AS $$
BEGIN
  DELETE FROM operation_logs WHERE created_at < NOW() - INTERVAL '90 days';
  RAISE NOTICE 'Cleaned up operation_logs older than 90 days';
END;
$$ LANGUAGE plpgsql;

-- 4. filter_logs 清理（保留 30 天）
-- 注：filter_logs 表不存在，跳过
-- CREATE OR REPLACE FUNCTION cleanup_filter_logs() RETURNS void AS $$
-- BEGIN
--   DELETE FROM filter_logs WHERE created_at < NOW() - INTERVAL '30 days';
--   RAISE NOTICE 'Cleaned up filter_logs older than 30 days';
-- END;
-- $$ LANGUAGE plpgsql;

-- 5. security_events 清理（保留 90 天）
CREATE OR REPLACE FUNCTION cleanup_security_events() RETURNS void AS $$
BEGIN
  DELETE FROM security_events WHERE created_at < NOW() - INTERVAL '90 days';
  RAISE NOTICE 'Cleaned up security_events older than 90 days';
END;
$$ LANGUAGE plpgsql;

-- 6. audit_logs 清理（保留 180 天）
CREATE OR REPLACE FUNCTION cleanup_audit_logs() RETURNS void AS $$
BEGIN
  DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '180 days';
  RAISE NOTICE 'Cleaned up audit_logs older than 180 days';
END;
$$ LANGUAGE plpgsql;

-- 7. user_login_history 清理（保留 12 个月）
CREATE OR REPLACE FUNCTION cleanup_login_history() RETURNS void AS $$
BEGIN
  DELETE FROM user_login_history WHERE created_at < NOW() - INTERVAL '12 months';
  RAISE NOTICE 'Cleaned up user_login_history older than 12 months';
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 统一清理入口函数
-- ============================================================
CREATE OR REPLACE FUNCTION run_log_cleanup() RETURNS void AS $$
BEGIN
  PERFORM cleanup_operation_logs();
  -- PERFORM cleanup_filter_logs(); -- 表不存在
  PERFORM cleanup_security_events();
  PERFORM cleanup_audit_logs();
  PERFORM cleanup_login_history();
  RAISE NOTICE 'All log cleanup completed';
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 使用说明
-- ============================================================
-- 1. 手动执行: SELECT run_log_cleanup();
-- 2. Cron 调度 (推荐每周日凌晨3点执行):
--    0 3 * * 0 psql -U postgres -d threecloud -c "SELECT run_log_cleanup();"
-- 3. 分区表清理需要单独处理，建议每月执行:
--    ALTER TABLE call_logs DETACH PARTITION call_logs_YYYYMM;
--    pg_dump -t call_logs_YYYYMM > /archive/call_logs_YYYYMM.sql
--    DROP TABLE call_logs_YYYYMM;
