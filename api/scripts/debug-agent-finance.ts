// 3cloud 代理商资金排查脚本
// 检查代理 #1 (13819008800@163.com) 的资金对账

import { createDb, getDb } from "../src/db/index.js";
import { agents, withdrawOrders, commissionLogs, users } from "../src/db/schema.js";
import { eq, and, sql } from "drizzle-orm";

async function main() {
  createDb();
  const db = getDb();
  const userId = 1; // 13819008800@163.com

  console.log("=".repeat(80));
  console.log("代理商资金数据排查");
  console.log("用户: 13819008800@163.com (userId=1)");
  console.log("=".repeat(80));

  // 1. 用户信息
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  console.log("\n【1】用户信息:", user?.email, "/ role:", user?.role);

  // 2. 代理商表
  const agentsList = await db.select().from(agents).where(eq(agents.userId, userId));
  if (agentsList.length === 0) {
    console.log("\n❌ 未找到代理商记录");
    return;
  }
  const agent = agentsList[0];
  console.log("\n【2】代理商表 (agents)");
  console.log("  id:", agent.id);
  console.log("  userId:", agent.userId);
  console.log("  totalCommission:", agent.totalCommission, "(总佣金)");
  console.log("  settledCommission:", agent.settledCommission, "(已结算佣金)");
  console.log("  pendingWithdraw:", agent.pendingWithdraw, "(待提现余额 ← 注意: 负值表示已扣减)");
  console.log("  frozenAmount:", agent.frozenAmount, "(冻结金额)");
  console.log("  status:", agent.status);
  console.log("  createdAt:", agent.createdAt);

  // 3. 所有提现订单
  const withdraws = await db.select().from(withdrawOrders).where(eq(withdrawOrders.agentId, agent.id)).orderBy(withdrawOrders.createdAt);
  console.log("\n【3】提现订单列表 (withdraw_orders)");
  console.log("  笔数:", withdraws.length);
  for (const w of withdraws) {
    console.log(`  #${w.id} | 金额: ${w.amount} | 手续费: ${w.feeAmount || "0"} | 实际: ${w.actualAmount || w.amount} | 状态: ${w.status} | ${w.createdAt}`);
  }

  // 4. 按状态汇总 withdraw_orders 表
  const [statusResult] = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'paid' THEN CAST(amount AS DECIMAL) ELSE 0 END), 0) AS paid_total,
      COALESCE(SUM(CASE WHEN status = 'rejected' THEN CAST(amount AS DECIMAL) ELSE 0 END), 0) AS rejected_total,
      COALESCE(SUM(CASE WHEN status NOT IN ('paid', 'rejected') THEN CAST(amount AS DECIMAL) ELSE 0 END), 0) AS pending_total,
      COUNT(*) AS total_orders,
      COUNT(*) FILTER (WHERE status NOT IN ('paid', 'rejected')) AS pending_count
    FROM withdraw_orders
    WHERE agent_id = ${agent.id}
  `);
  console.log("\n【4】提现订单汇总 (从 withdraw_orders 表查询)");
  if (statusResult && statusResult.rows) {
    const r = statusResult.rows[0];
    console.log("  已打款总计:", r.paid_total);
    console.log("  已拒绝总计:", r.rejected_total);
    console.log("  待处理总计:", r.pending_total, "(pending_first_review / pending_second_review / approved)");
    console.log("  总订单数:", r.total_orders);
    console.log("  待处理笔数:", r.pending_count);
  }

  // 5. 佣金汇总
  const [commResult] = await db.execute(sql`
    SELECT
      COALESCE(SUM(CAST(commission_amount AS DECIMAL)), 0) AS total_commission,
      COALESCE(SUM(CAST(commission_amount AS DECIMAL)) FILTER (WHERE status = 'pending'), 0) AS pending_commission,
      COALESCE(SUM(CAST(commission_amount AS DECIMAL)) FILTER (WHERE status = 'settled'), 0) AS settled_commission,
      COALESCE(SUM(CAST(commission_amount AS DECIMAL)) FILTER (WHERE status = 'cancelled'), 0) AS cancelled_commission,
      COUNT(*) AS total_records
    FROM commission_logs
    WHERE agent_id = ${agent.id}
  `);
  console.log("\n【5】佣金汇总 (从 commission_logs 表查询)");
  if (commResult && commResult.rows) {
    const r = commResult.rows[0];
    console.log("  总佣金:", r.total_commission);
    console.log("  待结算:", r.pending_commission);
    console.log("  已结算:", r.settled_commission);
    console.log("  已作废:", r.cancelled_commission);
    console.log("  总记录数:", r.total_records);
  }

  // 6. 资金对账
  console.log("\n【6】资金对账");
  // 理论上: settledCommission = 已结算佣金 (从 commission_logs 汇总)
  // pendingWithdraw 应该是: 已创建提现 - 已拒绝提现 (running balance)
  // 验证 pending_withdraw 字段逻辑

  if (commResult && commResult.rows && statusResult && statusResult.rows) {
    const cr = commResult.rows[0];
    const sr = statusResult.rows[0];

    const settledComm = parseFloat(cr.settled_commission || "0");
    const totalComm = parseFloat(cr.total_commission || "0");
    const pendingComm = parseFloat(cr.pending_commission || "0");
    const agentPendingW = parseFloat(agent.pendingWithdraw || "0");
    const agentSettled = parseFloat(agent.settledCommission || "0");
    const paidTotal = parseFloat(sr.paid_total || "0");
    const rejectedTotal = parseFloat(sr.rejected_total || "0");
    const pendingTotal = parseFloat(sr.pending_total || "0");
    const agentFrozen = parseFloat(agent.frozenAmount || "0");

    console.log("");
    console.log("  agents.totalCommission  .........", totalComm.toFixed(6));
    console.log("  agents.settledCommission  .......", agentSettled.toFixed(6));
    console.log("  agents.pendingWithdraw ..........", agentPendingW.toFixed(6), "(← 这应该是已提现扣减的运行余额)");
    console.log("  agents.frozenAmount ............", agentFrozen.toFixed(6));
    console.log("  ---");
    console.log("  withdraw_orders 已打款总计 .......", paidTotal.toFixed(6));
    console.log("  withdraw_orders 已拒绝总计 .......", rejectedTotal.toFixed(6));
    console.log("  withdraw_orders 待处理总计 .......", pendingTotal.toFixed(6));
    console.log("  ---");
    console.log("  佣金已结算金额 (commission_logs) ..", settledComm.toFixed(6));
    console.log("  agents.settledCommission  ........", agentSettled.toFixed(6));
    console.log("  → 差异: ", (settledComm - agentSettled).toFixed(6));

    // 验证 pending_withdraw 的逻辑
    // 预期 pending_withdraw = -(paid + pending) + rejected  (因为是 running balance)
    console.log("\n【7】pending_withdraw 字段逻辑验证");
    console.log("  预期 pending_withdraw = -(已打款 + 待处理) + 已拒绝");
    const expectedPending = -(paidTotal + pendingTotal) + rejectedTotal;
    console.log(`  = -(${paidTotal.toFixed(6)} + ${pendingTotal.toFixed(6)}) + ${rejectedTotal.toFixed(6)}`);
    console.log(`  = ${expectedPending.toFixed(6)}`);
    console.log("  实际 agents.pending_withdraw:", agentPendingW.toFixed(6));
    console.log("  差异:", (agentPendingW - expectedPending).toFixed(6));

    if (Math.abs(agentPendingW - expectedPending) > 0.001) {
      console.log("\n  ❌ 差异过大！pending_withdraw 字段可能异常！");
    } else {
      console.log("\n  ✅ pending_withdraw 字段逻辑验证通过");
    }
  }

  // 8. 管理员看到的 availableBalance
  console.log("\n【8】管理员详情页 availableBalance 计算 (getAgentById)");
  const agentPendingW2 = parseFloat(agent.pendingWithdraw || "0");
  const agentFrozen2 = parseFloat(agent.frozenAmount || "0");
  const adminAvailableBalance = agentPendingW2 - agentFrozen2;
  console.log("  availableBalance = pendingWithdraw - frozenAmount");
  console.log(`  = ${agentPendingW2.toFixed(6)} - ${agentFrozen2.toFixed(6)}`);
  console.log(`  = ${adminAvailableBalance.toFixed(6)}`);
  console.log("  ⚠️  这个计算有 bug！pending_withdraw 是负值（已扣减的余额），");
  console.log("  ⚠️  正确的可用余额应该是 settledCommission - 已打款 - 待处理 - frozen");

  const settledComm2 = parseFloat(agent.settledCommission || "0");
  if (statusResult && statusResult.rows) {
    const sr = statusResult.rows[0];
    const paid = parseFloat(sr.paid_total || "0");
    const pending = parseFloat(sr.pending_total || "0");
    const correctAvailable = settledComm2 - paid - pending - agentFrozen2;
    console.log("");
    console.log("  正确计算: settledCommission - paid - pending - frozen");
    console.log(`  = ${settledComm2.toFixed(6)} - ${paid.toFixed(6)} - ${pending.toFixed(6)} - ${agentFrozen2.toFixed(6)}`);
    console.log(`  = ${correctAvailable.toFixed(6)}`);
  }

  await db.$client.end();
}

main().catch(console.error);
