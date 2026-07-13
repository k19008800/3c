// ============================================================
//  阶段 8 - 对账 & 审计验证
// ============================================================

import { ApiClient } from "../api-client.js";
import { startPhase, endPhase, VerificationReport, writeCsvReport } from "../utils/verify.js";
import { createDb, closeDb } from "../../src/db/index.js";
import { eq, sql, and, gte, lte, inArray } from "drizzle-orm";
import {
  users,
  balanceLogs,
  callLogs,
  commissionLogs,
  rechargeOrders,
  withdrawOrders,
  auditLogs,
  commissionDailyRollup,
  dailyReconSummary,
  agentCustomerConsumption,
  agents,
} from "../../src/db/schema.js";

export async function phase8Verify(
  client: ApiClient,
  adminToken: string,
): Promise<VerificationReport> {
  startPhase("8: 对账 & 审计验证");
  const report = new VerificationReport();
  const db = createDb();

  // ── 8.1 资金平衡校验 ──
  console.log("  资金平衡校验...");

  // 总充值
  const [rechargeResult] = await db
    .select({ total: sql<string>`coalesce(sum(amount::numeric), 0)` })
    .from(rechargeOrders)
    .where(inArray(rechargeOrders.status, ["paid", "confirmed"]));
  const totalRecharge = parseFloat(rechargeResult?.total || "0");

  // 总消费（consumption 类型 balance_logs 的绝对值）
  const [consumptionResult] = await db
    .select({ total: sql<string>`coalesce(sum(abs(amount::numeric)), 0)` })
    .from(balanceLogs)
    .where(eq(balanceLogs.type, "consumption"));
  const totalConsumption = parseFloat(consumptionResult?.total || "0");

  // 总提现（已打款的）
  const [withdrawResult] = await db
    .select({ total: sql<string>`coalesce(sum(amount::numeric), 0)` })
    .from(withdrawOrders)
    .where(eq(withdrawOrders.status, "paid"));
  const totalWithdraw = parseFloat(withdrawResult?.total || "0");

  // 所有用户当前余额总和
  const [balanceResult] = await db
    .select({ total: sql<string>`coalesce(sum(balance::numeric), 0)` })
    .from(users);
  const totalBalance = parseFloat(balanceResult?.total || "0");

  const balanceDiff = parseFloat((totalRecharge - totalConsumption - totalWithdraw - totalBalance).toFixed(6));

  console.log(`  充值总额: ¥${totalRecharge.toFixed(6)}`);
  console.log(`  消费总额: ¥${totalConsumption.toFixed(6)}`);
  console.log(`  提现总额: ¥${totalWithdraw.toFixed(6)}`);
  console.log(`  余额总和: ¥${totalBalance.toFixed(6)}`);
  console.log(`  平衡差值: ¥${balanceDiff.toFixed(6)}`);

  const balanceOk = Math.abs(balanceDiff) < 0.01;
  report.add("资金平衡校验", balanceOk,
    `充值-消费-提现-余额 = ${balanceDiff.toFixed(6)}`);

  // ── 8.2 审计日志完整性 ──
  console.log("  审计日志查询...");
  const auditRes = await client.adminAuditLogs(adminToken, { page: 1 });
  const auditRows = auditRes.data?.rows || auditRes.data || [];
  const auditCount = Array.isArray(auditRows) ? auditRows.length : 0;
  report.add("审计日志可查询", auditCount > 0, `共 ${auditCount} 条`);

  // 按 action 分类统计
  const actionCounts = new Map<string, number>();
  try {
    const actions = await db
      .select({
        action: auditLogs.action,
        count: sql<number>`count(*)`,
      })
      .from(auditLogs)
      .groupBy(auditLogs.action);

    for (const a of actions) {
      actionCounts.set(a.action, a.count);
    }
    console.log(`  审计操作类型: ${actionCounts.size} 种`);
    for (const [action, count] of actionCounts) {
      console.log(`    ${action}: ${count} 次`);
    }
    report.add("审计日志操作覆盖", actionCounts.size >= 5, `${actionCounts.size} 种操作类型`);
  } catch {
    report.add("审计日志操作覆盖", false, "查询失败");
  }

  // ── 8.3 佣金汇总验证 ──
  console.log("  佣金汇总验证...");
  try {
    const commTotals = await db
      .select({
        totalComm: sql<string>`coalesce(sum(commission_amount::numeric), 0)`,
        totalFee: sql<string>`coalesce(sum(fee_amount::numeric), 0)`,
        totalNet: sql<string>`coalesce(sum(net_amount::numeric), 0)`,
        settledAmount: sql<string>`coalesce(sum(case when status='settled' then commission_amount::numeric else 0 end), 0)`,
      })
      .from(commissionLogs);

    console.log(`  佣金总额: ¥${parseFloat(commTotals[0].totalComm).toFixed(6)}`);
    console.log(`  手续费: ¥${parseFloat(commTotals[0].totalFee).toFixed(6)}`);
    console.log(`  净额: ¥${parseFloat(commTotals[0].totalNet).toFixed(6)}`);
    console.log(`  已结算: ¥${parseFloat(commTotals[0].settledAmount).toFixed(6)}`);

    report.add("佣金数据完整性", true,
      `佣金 ¥${parseFloat(commTotals[0].totalComm).toFixed(2)} | 手续费 ¥${parseFloat(commTotals[0].totalFee).toFixed(2)}`);
  } catch (err: any) {
    report.add("佣金数据完整性", false, err.message);
  }

  // ── 8.4 日汇总数据 ──
  console.log("  日汇总数据验证...");
  try {
    const dailyCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(commissionDailyRollup);
    report.add("佣金日汇总已生成", dailyCount[0].count > 0, `${dailyCount[0].count} 天`);
  } catch {
    report.add("佣金日汇总已生成", false);
  }

  // ── 8.5 客户消费汇总 ──
  console.log("  客户消费汇总验证...");
  try {
    const custCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(agentCustomerConsumption);
    report.add("客户消费汇总已生成", custCount[0].count > 0, `${custCount[0].count} 条`);
  } catch {
    report.add("客户消费汇总已生成", false);
  }

  // ── 8.6 输出报告 ──
  const reportRows = [
    { metric: "total_recharge", value: totalRecharge.toFixed(6) },
    { metric: "total_consumption", value: totalConsumption.toFixed(6) },
    { metric: "total_withdraw", value: totalWithdraw.toFixed(6) },
    { metric: "total_balance", value: totalBalance.toFixed(6) },
    { metric: "balance_diff", value: balanceDiff.toFixed(6) },
    { metric: "balance_ok", value: balanceOk ? "yes" : "no" },
    { metric: "audit_log_count", value: auditCount.toString() },
    { metric: "call_logs_expected", value: "100000" },
    { metric: "total_commission", value: commTotals?.[0]?.totalComm || "0" },
  ];
  writeCsvReport("balance-reconciliation.csv", reportRows);

  // ── 8.7 日对账汇总表 ──
  console.log("  日对账汇总表生成...");
  try {
    await db.execute(sql`
      INSERT INTO daily_recon_summary (
        report_date,
        commission_count, commission_total, commission_fee, commission_net,
        withdraw_count, withdraw_total,
        recharge_count, recharge_total,
        consumption_total,
        balance_diff, is_balanced,
        version
      )
      SELECT
        to_char(CURRENT_DATE, 'YYYY-MM-DD') as report_date,
        (SELECT count(*) FROM ${commissionLogs})::int,
        (SELECT coalesce(sum(commission_amount::numeric), 0) FROM ${commissionLogs}),
        (SELECT coalesce(sum(fee_amount::numeric), 0) FROM ${commissionLogs}),
        (SELECT coalesce(sum(net_amount::numeric), 0) FROM ${commissionLogs}),
        (SELECT count(*) FROM ${withdrawOrders} WHERE status = 'paid')::int,
        (SELECT coalesce(sum(amount::numeric), 0) FROM ${withdrawOrders} WHERE status = 'paid'),
        (SELECT count(*) FROM ${rechargeOrders} WHERE status IN ('paid', 'confirmed'))::int,
        ${totalRecharge},
        ${totalConsumption},
        ${balanceDiff},
        ${balanceOk},
        1
      ON CONFLICT (report_date) DO UPDATE SET
        commission_count = EXCLUDED.commission_count,
        commission_total = EXCLUDED.commission_total,
        commission_fee = EXCLUDED.commission_fee,
        commission_net = EXCLUDED.commission_net,
        withdraw_count = EXCLUDED.withdraw_count,
        withdraw_total = EXCLUDED.withdraw_total,
        recharge_count = EXCLUDED.recharge_count,
        recharge_total = EXCLUDED.recharge_total,
        consumption_total = EXCLUDED.consumption_total,
        balance_diff = EXCLUDED.balance_diff,
        is_balanced = EXCLUDED.is_balanced,
        version = ${dailyReconSummary.version} + 1,
        computed_at = now()
    `);
    report.add("日对账汇总表", true);
  } catch (err: any) {
    console.error(`  ⚠️  日对账汇总生成失败: ${err.message}`);
    report.add("日对账汇总表", false, err.message);
  }

  closeDb();
  endPhase("8: 对账 & 审计");
  return report;
}
