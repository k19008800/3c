-- ============================================================
--  3cloud (3C) — 数据库性能优化迁移（2026-07-15）
--  目标：消除 call_logs 全表扫描，优化 Dashboard / topConsumers / revenue 查询
--  执行方式：
--    npm run db:migrate:perf
--    或：
--    psql <connection_string> -f this-file.sql
-- ============================================================

-- ============================================================
--  1. call_logs 覆盖索引
--  背景：call_logs 按月 RANGE 分区，现有索引不能完全覆盖优化后的查询模式
--  注意：创建在父表上，PostgreSQL 12+ 自动传播到所有现有及未来分区
--  如果某些分区索引创建失败，可手动在对应分区上单独创建（见下方注释）
-- ============================================================

-- 1a. 覆盖索引 — buildStats（todayCalls / totalCalls 聚合）
--     查询模式：WHERE model_name=? AND status=? AND created_at BETWEEN ? AND ?
--     覆盖列：total_tokens, cost, duration_ms（实现 index-only scan）
--     典型查询：某模型某天成功/失败的调用统计
DROP INDEX IF EXISTS call_logs_cover_stats CASCADE;
CREATE INDEX CONCURRENTLY IF NOT EXISTS call_logs_cover_stats
  ON call_logs(model_name, status, created_at)
  INCLUDE (total_tokens, cost, duration_ms);

-- 1b. 覆盖索引 — topConsumers（90 天用户排名）
--     查询模式：WHERE created_at >= NOW() - INTERVAL '90 days' GROUP BY user_id ORDER BY SUM(cost) DESC
--     覆盖列：cost（无需回表即可完成 SUM 聚合）
DROP INDEX IF EXISTS call_logs_cover_top_consumers CASCADE;
CREATE INDEX CONCURRENTLY IF NOT EXISTS call_logs_cover_top_consumers
  ON call_logs(created_at, user_id)
  INCLUDE (cost);

-- 1c. 覆盖索引 — revenue（收入曲线按模型聚合）
--     查询模式：WHERE model_name=? AND created_at BETWEEN ? AND ?
--     覆盖列：cost（SUM 聚合无需回表）
DROP INDEX IF EXISTS call_logs_cover_revenue CASCADE;
CREATE INDEX CONCURRENTLY IF NOT EXISTS call_logs_cover_revenue
  ON call_logs(model_name, created_at)
  INCLUDE (cost);

-- ============================================================
--  2. vendor_models 查询优化索引
--  优化 queryAvailableRoutes 中的 JOIN 查询
--  典型查询：WHERE status=true AND is_down=false ORDER BY weight DESC
--  典型 JOIN：JOIN models m ON vm.model_id = m.id WHERE m.status = true
-- ============================================================

-- 多列复合索引 — 路由查询最常用过滤条件
DROP INDEX IF EXISTS vendor_models_route_query CASCADE;
CREATE INDEX CONCURRENTLY IF NOT EXISTS vendor_models_route_query
  ON vendor_models(status, is_down, model_id)
  INCLUDE (vendor_id, sell_price_input, sell_price_output, weight, rpm_limit, tpm_limit);

-- 单独索引 — 模型级别可用路由查询
-- 查询模式：WHERE model_id=? AND status=true AND is_down=false
DROP INDEX IF EXISTS vendor_models_model_available CASCADE;
CREATE INDEX CONCURRENTLY IF NOT EXISTS vendor_models_model_available
  ON vendor_models(model_id, status, is_down)
  INCLUDE (vendor_id, weight, sell_price_input, sell_price_output);

-- ============================================================
--  3. commission_logs 时间范围索引
--  优化 agent-commission 按时间范围汇总查询
--  典型查询：WHERE agent_id=? AND created_at BETWEEN ? AND ?
--            GROUP BY date_trunc('day', created_at) ORDER BY day DESC
--  已有索引：commission_logs_agent_id_created_at_idx (agent_id, created_at DESC)
--  补充：涵盖 commission_amount / net_amount 的覆盖索引
-- ============================================================

DROP INDEX IF EXISTS commission_logs_agent_cover CASCADE;
CREATE INDEX CONCURRENTLY IF NOT EXISTS commission_logs_agent_cover
  ON commission_logs(agent_id, created_at)
  INCLUDE (commission_amount, call_cost, net_amount, status);

-- 汇总类查询索引（跨代理商的整体时间范围聚合）
-- 查询模式：WHERE created_at BETWEEN ? AND ? AND status IN (?) GROUP BY agent_id
DROP INDEX IF EXISTS commission_logs_time_range CASCADE;
CREATE INDEX CONCURRENTLY IF NOT EXISTS commission_logs_time_range
  ON commission_logs(created_at, status)
  INCLUDE (agent_id, commission_amount, net_amount);

-- ============================================================
--  4. daily_user_consumption 物化视图
--  解决 topConsumers 全表 GROUP BY 的根本方案
--  预聚合日级用户消费数据，按需 REFRESH（可选 Cron）
--  查询替代：SELECT user_id, SUM(total_cost) FROM daily_user_consumption
--            WHERE report_date >= CURRENT_DATE - 90 GROUP BY user_id ORDER BY 2 DESC LIMIT 10;
-- ============================================================

-- 创建物化视图（首次执行）
DROP MATERIALIZED VIEW IF EXISTS daily_user_consumption CASCADE;
CREATE MATERIALIZED VIEW daily_user_consumption AS
SELECT
  DATE(created_at AT TIME ZONE 'Asia/Shanghai')  AS report_date,
  user_id,
  COUNT(*)                                         AS call_count,
  SUM(cost)                                        AS total_cost,
  SUM(total_tokens)                                AS total_tokens,
  SUM(duration_ms)                                 AS total_duration_ms,
  COUNT(*) FILTER (WHERE status = 'success')       AS success_count,
  COUNT(*) FILTER (WHERE status = 'failed')        AS failed_count
FROM call_logs
GROUP BY DATE(created_at AT TIME ZONE 'Asia/Shanghai'), user_id
WITH NO DATA;

-- 物化视图索引

-- 按日期查询（Dashboard 趋势图）
CREATE UNIQUE INDEX IF NOT EXISTS duc_date_user_idx
  ON daily_user_consumption(report_date, user_id);

-- topConsumers 查询加速（支持 90 天窗口）
CREATE INDEX IF NOT EXISTS duc_user_date_idx
  ON daily_user_consumption(user_id, report_date)
  INCLUDE (total_cost, call_count);

-- 日期范围查询加速（首次需要 REFRESH，之后增量 REFRESH CONCURRENTLY）
CREATE INDEX IF NOT EXISTS duc_date_idx
  ON daily_user_consumption(report_date)
  INCLUDE (total_cost, total_tokens);

-- 刷新函数（可选）
-- 手动刷新：REFRESH MATERIALIZED VIEW CONCURRENTLY daily_user_consumption;
-- Cron 建议：每 5 分钟执行一次 REFRESH MATERIALIZED VIEW CONCURRENTLY
-- 注意：首次需执行 REFRESH MATERIALIZED VIEW daily_user_consumption（非 CONCURRENTLY）

-- ============================================================
--  5. system_configs 查询优化索引确认
--  已有唯一索引 system_configs_key_idx (key) ✓
--  无额外索引需求
-- ============================================================

-- 确认索引存在
SELECT 'system_configs_key_idx exists: ' || COUNT(*)::TEXT AS check_index
FROM pg_indexes
WHERE tablename = 'system_configs' AND indexname = 'system_configs_key_idx';

-- ============================================================
--  6. 统计信息更新（迁移后分析）
--  确保查询优化器能利用新索引生成最佳计划
-- ============================================================

ANALYZE call_logs;
ANALYZE vendor_models;
ANALYZE commission_logs;

-- ============================================================
--  番外：已有无用索引清理（如不再使用的旧索引）
--  注意：以下为可选清理步骤，确认无业务依赖后再执行
-- ============================================================
-- 在 2026-07-15 之后待观察确认可移除旧索引：
-- call_logs_model_name_created_at_idx（已被 cover_stats 覆盖）
-- 确认无查询依赖后执行：
-- DROP INDEX IF EXISTS call_logs_model_name_created_at_idx;
