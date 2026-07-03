-- ============================================================
--  3cloud (3C) — 回填 commission_daily_rollup 历史数据
--  创建时间：2026-06-30
--  背景：管理后台佣金流水页面查询 commission_daily_rollup 表，
--        但该表只在结算/作废时被更新，历史佣金从未被写入。
--        此 SQL 回填所有缺失的汇总行。
--  执行方式：管理员手动执行一次
--  pscale connect 3cloud --execute < this-file.sql
-- ============================================================

WITH daily_agg AS (
  SELECT
    cl.agent_id,
    cl.created_at::date AS report_date,
    count(*)::int AS total_records,
    coalesce(sum(cl.call_cost), 0)::numeric(18,6) AS total_call_cost,
    coalesce(sum(cl.commission_amount), 0)::numeric(18,6) AS total_commission_amount,
    coalesce(sum(cl.fee_amount), 0)::numeric(18,6) AS total_fee_amount,
    coalesce(sum(cl.net_amount), 0)::numeric(18,6) AS total_net_amount,
    count(*) FILTER (WHERE cl.status = 'pending')::int AS pending_count,
    count(*) FILTER (WHERE cl.status = 'settled')::int AS settled_count,
    count(*) FILTER (WHERE cl.status = 'cancelled')::int AS cancelled_count,
    coalesce(sum(cl.commission_amount) FILTER (WHERE cl.status = 'pending'), 0)::numeric(18,6) AS pending_amount,
    coalesce(sum(cl.commission_amount) FILTER (WHERE cl.status = 'settled'), 0)::numeric(18,6) AS settled_amount,
    coalesce(sum(cl.commission_amount) FILTER (WHERE cl.status = 'cancelled'), 0)::numeric(18,6) AS cancelled_amount,
    count(*) FILTER (WHERE cl.commission_type = 'sale')::int AS sale_count,
    count(*) FILTER (WHERE cl.commission_type = 'renewal')::int AS renewal_count,
    count(*) FILTER (WHERE cl.commission_type = 'activity')::int AS activity_count,
    coalesce(sum(cl.commission_amount) FILTER (WHERE cl.commission_type = 'sale'), 0)::numeric(18,6) AS sale_amount,
    coalesce(sum(cl.commission_amount) FILTER (WHERE cl.commission_type = 'renewal'), 0)::numeric(18,6) AS renewal_amount,
    coalesce(sum(cl.commission_amount) FILTER (WHERE cl.commission_type = 'activity'), 0)::numeric(18,6) AS activity_amount
  FROM commission_logs cl
  GROUP BY cl.agent_id, cl.created_at::date
)
INSERT INTO commission_daily_rollup (
  agent_id, report_date,
  total_records, total_call_cost, total_commission_amount, total_fee_amount, total_net_amount,
  pending_count, settled_count, cancelled_count,
  pending_amount, settled_amount, cancelled_amount,
  sale_count, renewal_count, activity_count,
  sale_amount, renewal_amount, activity_amount
)
SELECT
  d.agent_id, d.report_date::text,
  d.total_records, d.total_call_cost, d.total_commission_amount, d.total_fee_amount, d.total_net_amount,
  d.pending_count, d.settled_count, d.cancelled_count,
  d.pending_amount, d.settled_amount, d.cancelled_amount,
  d.sale_count, d.renewal_count, d.activity_count,
  d.sale_amount, d.renewal_amount, d.activity_amount
FROM daily_agg d
WHERE NOT EXISTS (
  SELECT 1 FROM commission_daily_rollup r
  WHERE r.agent_id = d.agent_id AND r.report_date = d.report_date::text
)
ON CONFLICT (agent_id, report_date) DO NOTHING;

-- 输出统计
SELECT
  '回填完成' AS status,
  count(*) AS total_rows,
  sum(total_records) AS total_commission_logs,
  sum(pending_count) AS pending_count,
  sum(settled_count) AS settled_count,
  sum(cancelled_count) AS cancelled_count
FROM commission_daily_rollup;
