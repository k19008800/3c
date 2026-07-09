import { createDb, getDb } from "../src/db/index.js";
import { sql } from "drizzle-orm";
createDb();
const db = getDb();

const AGENT_ID = 1;

console.log("=".repeat(90));
console.log("代理商 #1 (13819008800@163.com) 资金数据全排查");
console.log("=".repeat(90));

// 1. Agents 表
const [agent] = (await db.execute(sql`SELECT * FROM agents WHERE id = ${AGENT_ID}`)).rows;
console.log("\n【1】agents 表字段:");
console.log("  total_commission:", agent.total_commission);
console.log("  settled_commission:", agent.settled_commission);
console.log("  pending_withdraw:", agent.pending_withdraw);
console.log("  frozen_amount:", agent.frozen_amount);
console.log("  status:", agent.status);

// 2. Withdraw orders
const withdraws = (await db.execute(
  sql`SELECT id, amount, fee_amount, actual_amount, status, created_at, paid_at, reject_reason FROM withdraw_orders WHERE agent_id = ${AGENT_ID} ORDER BY created_at`
)).rows;
console.log("\n【2】提现订单 (withdraw_orders) — 共 " + withdraws.length + " 条:");
for (const w of withdraws) {
  console.log(`  #${w.id} 金额:${w.amount} 手续费:${w.fee_amount || 0} 实际:${w.actual_amount || w.amount} 状态:${w.status} 创建:${w.created_at}`);
}

// 2.1 汇总
const withdrawSummary = (await db.execute(sql`
  SELECT 
    COUNT(*) AS total_count,
    COUNT(*) FILTER (WHERE status = 'paid') AS paid_count,
    COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_count,
    COUNT(*) FILTER (WHERE status NOT IN ('paid', 'rejected')) AS pending_count,
    COALESCE(SUM(CAST(amount AS DECIMAL)) FILTER (WHERE status = 'paid'), 0) AS paid_total,
    COALESCE(SUM(CAST(amount AS DECIMAL)) FILTER (WHERE status = 'rejected'), 0) AS rejected_total,
    COALESCE(SUM(CAST(amount AS DECIMAL)) FILTER (WHERE status NOT IN ('paid', 'rejected')), 0) AS pending_total
  FROM withdraw_orders WHERE agent_id = ${AGENT_ID}
`)).rows[0];
console.log("\n【2.1】提现订单汇总:");
console.log("  总笔数:", withdrawSummary.total_count);
console.log("  已打款:", withdrawSummary.paid_count, "笔, 共计 ¥" + withdrawSummary.paid_total);
console.log("  已拒绝:", withdrawSummary.rejected_count, "笔, 共计 ¥" + withdrawSummary.rejected_total);
console.log("  待处理:", withdrawSummary.pending_count, "笔, 共计 ¥" + withdrawSummary.pending_total);

// 3. Commission logs
const commissionSummary = (await db.execute(sql`
  SELECT
    COUNT(*) AS total_count,
    COALESCE(SUM(CAST(commission_amount AS DECIMAL)), 0) AS total_commission,
    COALESCE(SUM(CAST(commission_amount AS DECIMAL)) FILTER (WHERE status = 'pending'), 0) AS pending_commission,
    COALESCE(SUM(CAST(commission_amount AS DECIMAL)) FILTER (WHERE status = 'settled'), 0) AS settled_commission,
    COALESCE(SUM(CAST(commission_amount AS DECIMAL)) FILTER (WHERE status = 'cancelled'), 0) AS cancelled_commission
  FROM commission_logs WHERE agent_id = ${AGENT_ID}
`)).rows[0];
console.log("\n【3】佣金汇总 (commission_logs):");
console.log("  总记录数:", commissionSummary.total_count);
console.log("  总佣金: ¥" + commissionSummary.total_commission);
console.log("  待结算: ¥" + commissionSummary.pending_commission);
console.log("  已结算: ¥" + commissionSummary.settled_commission);
console.log("  已作废: ¥" + commissionSummary.cancelled_commission);

// 4. pending_withdraw 字段验证
console.log("\n【4】pending_withdraw 字段逻辑验证:");
const paidTotal = parseFloat(withdrawSummary.paid_total);
const rejectedTotal = parseFloat(withdrawSummary.rejected_total);
const pendingTotal = parseFloat(withdrawSummary.pending_total);
const actualPending = parseFloat(agent.pending_withdraw);

// 理论: pending_withdraw 的初始值是 0（代理创建时）
// 创建提现时: pending_withdraw = pending_withdraw - amount
// 拒绝时: pending_withdraw = pending_withdraw + amount
// 所以预期值 = 0 - paid_total - pending_total + rejected_total
const expectedPending = -(paidTotal + pendingTotal) + rejectedTotal;
console.log("  预期值 = 0 - (paid_total) - (pending_total) + (rejected_total)");
console.log("         = 0 - (" + paidTotal.toFixed(6) + ") - (" + pendingTotal.toFixed(6) + ") + (" + rejectedTotal.toFixed(6) + ")");
console.log("         = " + expectedPending.toFixed(6));
console.log("  实际值 = " + actualPending.toFixed(6));
console.log("  差异 = " + (actualPending - expectedPending).toFixed(6));

// 5. 余额对账
console.log("\n【5】资金余额对账:");
console.log("  agents 表字段:");
console.log("    settled_commission = ¥" + agent.settled_commission);
console.log("    pending_withdraw   = ¥" + agent.pending_withdraw);
console.log("    frozen_amount      = ¥" + agent.frozen_amount);
console.log("    total_commission   = ¥" + agent.total_commission);

console.log("\n  管理后台 getAgentById 的 availableBalance 计算:");
const pW = parseFloat(agent.pending_withdraw);
const fA = parseFloat(agent.frozen_amount);
const adminAvail = pW - fA;
console.log("    availableBalance = pending_withdraw - frozen_amount");
console.log("                      = " + pW.toFixed(6) + " - " + fA.toFixed(6));
console.log("                      = ¥" + adminAvail.toFixed(6));
console.log("    ⚠️  这个计算公式是错误的! pending_withdraw 是负值表示已扣除的提现余额");

console.log("\n  代理后台 getAgentDashboard 的正确计算:");
const sC = parseFloat(agent.settled_commission);
const correctAvailable = sC - paidTotal - pendingTotal - fA;
console.log("    availableBalance = settled_commission - paid_total - pending_total - frozen_amount");
console.log("                      = " + sC.toFixed(6) + " - " + paidTotal.toFixed(6) + " - " + pendingTotal.toFixed(6) + " - " + fA.toFixed(6));
console.log("                      = ¥" + correctAvailable.toFixed(6));

// 6. pending_withdraw 为什么是 ¥-2337.84
console.log("\n【6】pending_withdraw = ¥-2337.84 的来源分析:");
console.log("  pending_withdraw 是 running balance 字段，创建提现时递减，拒绝时递增。");
if (withdraws.length === 0) {
  console.log("  ⚠️  但 withdraw_orders 表没有记录? 可能是历史数据遗留或者另有其他逻辑修改了这个字段");
  // 检查是否有其他方式修改了 pending_withdraw
  const roleChanges = (await db.execute(sql`
    SELECT old_role, new_role, created_at FROM user_role_history WHERE user_id = 6
  `)).rows;
  console.log("  用户角色变更历史:", roleChanges);
}

// 7. 界面展示差异
console.log("\n【7】管理后台显示 vs 代理商后台显示:");
console.log("  ┌──────────────────────────┬─────────────────┬─────────────────┐");
console.log("  │ 项目                      │ 管理后台        │ 代理商后台       │");
console.log("  ├──────────────────────────┼─────────────────┼─────────────────┤");
console.log("  │ settledCommission        │ " + String(agent.settled_commission || "0").padStart(15) + " │ " + String(agent.settled_commission || "0").padStart(15) + " │");
console.log("  │ pendingWithdraw(待提现)   │ " + String(agent.pending_withdraw || "0").padStart(15) + " │ (从订单表汇总)   │");
console.log("  │ 待提现(订单表汇总)        │ —               │ ¥" + pendingTotal.toFixed(2).padStart(11) + " │");
const agentTotalComm = parseFloat(agent.total_commission || "0");
const agentSettledComm = parseFloat(agent.settled_commission || "0");
if (withdraws.length > 0) {
  console.log("  │ 已提现(订单表汇总)        │ —               │ ¥" + paidTotal.toFixed(2).padStart(11) + " │");
}
console.log("  │ availableBalance         │ ¥" + adminAvail.toFixed(2).padStart(12) + " │ ¥" + correctAvailable.toFixed(2).padStart(12) + " │");
console.log("  └──────────────────────────┴─────────────────┴─────────────────┘");

// 8. 问题确认
console.log("\n" + "=".repeat(90));
console.log("【问题确认】");
console.log("=".repeat(90));
console.log("");
console.log("1. 代理商 #1 (13819008800@163.com) 管理后台详情页显示: 待提现 ¥" + actualPending.toFixed(2));
console.log("   这是一个负值, 因为 agents.pending_withdraw 是 running balance 字段(负值=已扣除)");
console.log("   对应的提现金额: ", withdraws.length > 0 ? `有 ${withdraws.length} 笔提现记录` : "无提现记录");
console.log("   待处理提现(订单表实时汇总): ¥" + pendingTotal.toFixed(2));
console.log("");
console.log("2. 代理商后台看到的「待提现金额」是从 withdraw_orders 表实时汇总的");
console.log("   (status NOT IN ('paid','rejected') 的 sum(amount))");
console.log("   所以代理商看到的金额 = ¥" + pendingTotal.toFixed(2));
console.log("");

if (withdraws.length > 0) {
  console.log("3. 差异原因: 管理后台直接读取 agents.pending_withdraw 字段(运行余额)，");
  console.log("   代理商后台从 withdraw_orders 表实时 SUM 汇总");
  console.log("   两者数据源不同!");
} else {
  console.log("3. ⚠️ 但 withdraw_orders 表没有记录，说明 pending_withdraw 可能被别的逻辑修改了!");
}
console.log("");
console.log("4. Bug 确认:");
console.log("   ❌ getAgentById() 中 availableBalance 的计算公式错误");
console.log("      availableBalance = pendingWithdraw - frozenAmount");
console.log("      正确: settledCommission - 已打款 - 待处理提现 - frozenAmount");
console.log("   ❌ pending_withdraw 字段是否为负值导致界面展示混淆");

process.exit(0);
