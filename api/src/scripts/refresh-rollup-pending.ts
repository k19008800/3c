// ============================================================
//  3cloud (3C) — 刷新现有 rollup 行的 pending 统计数据
//  背景：回填 SQL 因 NOT EXISTS 跳过了已有日期行，
//        导致这些行的 pending_count/pending_amount 为 0。
//  操作：更新所有已有 rollup 行的统计数据
//  用法：npx tsx src/scripts/refresh-rollup-pending.ts
// ============================================================

import { createDb, closeDb } from "../db/index.js";
import { sql } from "drizzle-orm";

async function main() {
  const db = createDb();
  console.log("[Refresh] 开始刷新已有 rollup 行的 pending/status 统计数据...\n");

  // 先统计当前 pending
  const [pendingBefore] = (await db.execute(sql`
    SELECT sum(pending_count)::int AS pending_count, sum(pending_amount)::numeric(18,6) AS pending_amount
    FROM commission_daily_rollup
  `)).rows;

  console.log(`刷新前 rollup pending: ${pendingBefore?.pending_count ?? 0} 条, ¥${pendingBefore?.pending_amount ?? 0}`);

  // 查 total pending from commission_logs
  const [actualPending] = (await db.execute(sql`
    SELECT count(*)::int AS cnt, sum(commission_amount)::numeric(18,6) AS amt
    FROM commission_logs WHERE status = 'pending'
  `)).rows;

  console.log(`commission_logs 实际 pending: ${actualPending?.cnt ?? 0} 条, ¥${actualPending?.amt ?? 0}\n`);

  // 用 refreshRollupForAgentDate 逐一更新？太慢。直接用 SQL 批量更新所有行的统计数据
  const updateResult = await db.execute(sql`
    UPDATE commission_daily_rollup r
    SET
      total_records = agg.total_records,
      total_call_cost = agg.total_call_cost,
      total_commission_amount = agg.total_commission_amount,
      total_fee_amount = agg.total_fee_amount,
      total_net_amount = agg.total_net_amount,
      pending_count = agg.pending_count,
      settled_count = agg.settled_count,
      cancelled_count = agg.cancelled_count,
      pending_amount = agg.pending_amount,
      settled_amount = agg.settled_amount,
      cancelled_amount = agg.cancelled_amount,
      sale_count = agg.sale_count,
      renewal_count = agg.renewal_count,
      activity_count = agg.activity_count,
      sale_amount = agg.sale_amount,
      renewal_amount = agg.renewal_amount,
      activity_amount = agg.activity_amount
    FROM (
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
    ) agg
    WHERE r.agent_id = agg.agent_id
      AND r.report_date = agg.report_date::text
  `);

  console.log(`更新行数: ${updateResult?.rowCount ?? 0}\n`);

  // 查刷新后
  const [pendingAfter] = (await db.execute(sql`
    SELECT sum(pending_count)::int AS pending_count, sum(pending_amount)::numeric(18,6) AS pending_amount
    FROM commission_daily_rollup
  `)).rows;

  console.log(`刷新后 rollup pending: ${pendingAfter?.pending_count ?? 0} 条, ¥${pendingAfter?.pending_amount ?? 0}`);
  console.log(`\n✅ 完成！管理员现可在「财务→佣金流水」页面看到待结算记录并操作。`);

  await closeDb();
  process.exit(0);
}

main().catch((err) => {
  console.error("[Refresh] 失败:", err);
  process.exit(1);
});
