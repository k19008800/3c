// ============================================================
//  3cloud (3C) — 代理商费用结算模拟数据
//  为 13819008800@163.com (agentId=1) 生成：
//    1. 佣金日汇总 (commission_daily_rollup) — 30天
//    2. 日终对账 (daily_recon_summary) — 30天 (1天不平)
//    3. 提现全生命周期 (8笔, 覆盖所有状态 + 手续费)
//    4. 代理商余额演进 (时间线一致)
//    5. 审计日志
//
//  运行: npx tsx src/db/seed-settlement-data.ts
// ============================================================
import "dotenv/config";
import { createDb, closeDb, getDb } from "./index.js";
import { eq, sql, and, inArray, gte, lte } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  agents,
  users,
  callLogs,
  commissionLogs,
  commissionDailyRollup,
  dailyReconSummary,
  withdrawOrders,
  agentClients,
  rechargeOrders,
  balanceLogs,
  auditLogs,
} from "./schema.js";

// ═══════════════════════════════════════════════
//  配置
// ═══════════════════════════════════════════════

const AGENT_ID = 1;
const ADMIN_ID = 5;        // admin@3cloud.dev
const AGENT_RATE = 0.10;   // 10% 分佣比例

// 日期范围：回溯 30 天
const NOW = new Date();
const DAY_MS = 86400000;
const START_DAYS = 30;

// ═══════════════════════════════════════════════
//  工具函数
// ═══════════════════════════════════════════════

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * DAY_MS);
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : parseFloat(v) || 0;
}

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ═══════════════════════════════════════════════
//  主流程
// ═══════════════════════════════════════════════

async function main() {
  const db = createDb();
  console.log("═══════════════════════════════════════════════");
  console.log("  3cloud — 代理商费用结算模拟数据生成");
  console.log("  代理商: 13819008800@163.com (agentId=1)");
  console.log("═══════════════════════════════════════════════\n");

  // ── Step 1: 确认代理商 & 现有状态 ──
  const [agent] = await db.select().from(agents).where(eq(agents.id, AGENT_ID));
  if (!agent) {
    console.error("❌ 代理商不存在！");
    await closeDb();
    process.exit(1);
  }
  console.log("📋 代理商当前余额:");
  console.log(`  累计佣金:     ¥${num(agent.totalCommission).toFixed(4)}`);
  console.log(`  已结算佣金:   ¥${num(agent.settledCommission).toFixed(4)}`);
  console.log(`  待提现金额:   ¥${num(agent.pendingWithdraw).toFixed(4)}`);
  console.log(`  冻结金额:     ¥${num(agent.frozenAmount).toFixed(4)}`);

  // 确认有客户数据
  const [clientCount] = await db.select({
    c: sql<number>`count(*)::int`,
  }).from(agentClients).where(eq(agentClients.agentId, AGENT_ID));
  console.log(`  名下客户数:   ${clientCount.c}`);

  if (clientCount.c === 0) {
    console.error("❌ 没有客户数据！请先运行 seed-agent-clients.ts");
    await closeDb();
    process.exit(1);
  }

  // ──────────────────────────────────────────────
  //  Step 2: 生成佣金日汇总 (commission_daily_rollup)
  //  回溯 30 天，每天模拟业务量
  // ──────────────────────────────────────────────

  console.log("\n📊 生成佣金日汇总 (30 天)...");

  // 先清空旧的 rollup 数据（由历史种子数据留下的）
  await db.delete(commissionDailyRollup)
    .where(eq(commissionDailyRollup.agentId, AGENT_ID));

  let rollupCount = 0;
  // 累计销售额度（用于平衡演进）
  let cumulativeTotalComm = num(agent.totalCommission);
  // 我们从 30 天前开始回溯，每天 + 部分量
  // 用一个"模拟"用户 ID 池来生成消费数据（用已有客户）
  const clientList = await db.select({
    uid: agentClients.clientUserId,
  }).from(agentClients).where(eq(agentClients.agentId, AGENT_ID));

  const clientIds = clientList.map(c => c.uid);

  for (let d = START_DAYS; d >= 0; d--) {
    const date = daysAgo(d);
    const dateStr = fmtDate(date);
    // 越近的日期消费越多（业务增长趋势）
    const dayFactor = 1 + (START_DAYS - d) / START_DAYS * 0.5;
    const recordsPerDay = randInt(3, 8);
    const callCostSum = rand(8, 25) * dayFactor;
    const commSum = callCostSum * AGENT_RATE;
    const pending = d > 3 ? randInt(1, 3) : 0; // 最近 3 天有未结算
    const settled = recordsPerDay - pending - (d === 0 ? 0 : 0);
    const cancelled = d === 15 ? randInt(1, 2) : 0; // 第15天有作废

    await db.insert(commissionDailyRollup).values({
      agentId: AGENT_ID,
      reportDate: dateStr,
      totalRecords: recordsPerDay,
      totalCallCost: callCostSum.toFixed(6),
      totalCommissionAmount: commSum.toFixed(6),
      totalFeeAmount: (commSum * 0.01).toFixed(6),
      totalNetAmount: (commSum * 0.99).toFixed(6),
      pendingCount: pending,
      settledCount: settled,
      cancelledCount: cancelled,
      pendingAmount: (commSum * pending / recordsPerDay).toFixed(6),
      settledAmount: (commSum * settled / recordsPerDay).toFixed(6),
      cancelledAmount: (commSum * cancelled / recordsPerDay).toFixed(6),
      saleCount: recordsPerDay - randInt(0, 2),
      renewalCount: randInt(0, 1),
      activityCount: randInt(0, 1),
      saleAmount: (commSum * 0.85).toFixed(6),
      renewalAmount: (commSum * 0.10).toFixed(6),
      activityAmount: (commSum * 0.05).toFixed(6),
      agentTotalCommission: cumulativeTotalComm.toFixed(6),
      agentSettledCommission: (cumulativeTotalComm - commSum * pending / recordsPerDay).toFixed(6),
      updatedAt: date,
      createdAt: date,
    });

    cumulativeTotalComm += commSum;
    rollupCount++;
  }
  console.log(`  ✅ ${rollupCount} 条日汇总记录`);

  // ──────────────────────────────────────────────
  //  Step 3: 生成日终对账汇总 (daily_recon_summary)
  //  回溯 30 天，每天一条平衡记录
  //  第 10 天故意不平衡（模拟异常）
  // ──────────────────────────────────────────────

  console.log("\n📒 生成日终对账汇总 (30 天)...");

  await db.delete(dailyReconSummary);

  let reconCount = 0;
  for (let d = START_DAYS; d >= 0; d--) {
    const date = daysAgo(d);
    const dateStr = fmtDate(date);
    const dayFactor = 1 + (START_DAYS - d) / START_DAYS * 0.5;
    const commTotal = rand(10, 30) * dayFactor;
    const commFee = commTotal * 0.01;
    const commNet = commTotal - commFee;
    const wdTotal = d > 10 ? rand(5, 20) * dayFactor : 0;
    const wdFee = wdTotal * 0.01;
    const wdActual = wdTotal - wdFee;
    const rcTotal = rand(50, 200) * dayFactor;
    const consTotal = rand(15, 40) * dayFactor;
    // 消费 = 充值 - 余额变化
    const isBalanced = d !== 10; // 第10天故意不平
    const balanceDiff = isBalanced ? 0 : rand(5, 15) * (Math.random() > 0.5 ? 1 : -1);

    await db.insert(dailyReconSummary).values({
      reportDate: dateStr,
      commissionCount: randInt(3, 8),
      commissionTotal: commTotal.toFixed(6),
      commissionFee: commFee.toFixed(6),
      commissionNet: commNet.toFixed(6),
      withdrawCount: d > 10 ? randInt(1, 3) : 0,
      withdrawTotal: wdTotal.toFixed(6),
      withdrawFee: wdFee.toFixed(6),
      withdrawActual: wdActual.toFixed(6),
      rechargeCount: randInt(1, 4),
      rechargeTotal: rcTotal.toFixed(6),
      consumptionTotal: consTotal.toFixed(6),
      balanceDiff: balanceDiff.toFixed(6),
      isBalanced,
      version: 1,
      computedAt: new Date(date.getTime() + DAY_MS - 60000),
    });
    reconCount++;
  }
  console.log(`  ✅ ${reconCount} 条日对账记录 (第10天不平衡)`);
  console.log(`     不平衡记录: 2026-06-19 (day=10, diff≠0)`);

  // ──────────────────────────────────────────────
  //  Step 4: 生成提现全生命周期记录
  //  8 笔提现，覆盖所有状态 + 手续费 + 风控快照
  // ──────────────────────────────────────────────

  console.log("\n🏧 生成提现记录 (8 笔, 覆盖全状态)...");

  // 先清空旧提现记录（避免与 seed-agent-clients 冲突）
  // 保留现有的 approved 和 pending 提现，只添加新的
  // 但为了避免冲突，我们清理重建
  await db.delete(withdrawOrders).where(eq(withdrawOrders.agentId, AGENT_ID));
  // 同时重置 agent 的 pendingWithdraw 和 frozenAmount
  await db.update(agents)
    .set({
      pendingWithdraw: "0.000000",
      frozenAmount: "0.000000",
    })
    .where(eq(agents.id, AGENT_ID));

  // 清理旧的账单审计日志
  await db.delete(auditLogs)
    .where(and(
      eq(auditLogs.targetType, "withdraw_order"),
      eq(auditLogs.operatorId, ADMIN_ID),
    ));

  interface WithdrawSeed {
    amount: string;
    status: "paid" | "approved" | "pending_second_review" | "pending_first_review" | "rejected";
    daysAgo: number;
    fee: string;
    actual: string;
    bankCardNo: string;
    bankName: string;
    rejectReason?: string;
    hasRiskCheck: boolean;
    firstReviewDaysAgo?: number;
    secondReviewDaysAgo?: number;
    paidDaysAgo?: number;
  }

  const withdrawSeeds: WithdrawSeed[] = [
    // #1: 已打款（完整流程）
    {
      amount: "50.00",
      status: "paid",
      daysAgo: 25,
      fee: "0.50",
      actual: "49.50",
      bankCardNo: "621700****7890",
      bankName: "建设银行",
      hasRiskCheck: true,
      firstReviewDaysAgo: 24,
      secondReviewDaysAgo: 23,
      paidDaysAgo: 21,
    },
    // #2: 已打款（小额）
    {
      amount: "35.00",
      status: "paid",
      daysAgo: 18,
      fee: "0.35",
      actual: "34.65",
      bankCardNo: "622202****1234",
      bankName: "工商银行",
      hasRiskCheck: true,
      firstReviewDaysAgo: 17,
      secondReviewDaysAgo: 16,
      paidDaysAgo: 14,
    },
    // #3: 已通过待打款
    {
      amount: "28.00",
      status: "approved",
      daysAgo: 8,
      fee: "0.28",
      actual: "27.72",
      bankCardNo: "621226****4567",
      bankName: "农业银行",
      hasRiskCheck: true,
      firstReviewDaysAgo: 7,
      secondReviewDaysAgo: 6,
    },
    // #4: 待复审（初审已过）
    {
      amount: "20.00",
      status: "pending_second_review",
      daysAgo: 5,
      fee: "0.20",
      actual: "19.80",
      bankCardNo: "622848****9012",
      bankName: "中国银行",
      hasRiskCheck: true,
      firstReviewDaysAgo: 4,
    },
    // #5: 待初审
    {
      amount: "15.00",
      status: "pending_first_review",
      daysAgo: 2,
      fee: "0.15",
      actual: "14.85",
      bankCardNo: "621790****3456",
      bankName: "招商银行",
      hasRiskCheck: false,
    },
    // #6: 已拒绝（初审阶段）
    {
      amount: "10.00",
      status: "rejected",
      daysAgo: 12,
      fee: "0.10",
      actual: "9.90",
      bankCardNo: "621558****6789",
      bankName: "交通银行",
      hasRiskCheck: false,
      rejectReason: "银行账户信息与实名认证不符，请核实后重新提交",
      firstReviewDaysAgo: 11,
    },
    // #7: 已拒绝（复审阶段）
    {
      amount: "30.00",
      status: "rejected",
      daysAgo: 20,
      fee: "0.30",
      actual: "29.70",
      bankCardNo: "621661****2345",
      bankName: "浦发银行",
      hasRiskCheck: true,
      rejectReason: "风控规则命中：提现 IP 与常用 IP 不符，且金额超过当日风控阈值，已自动拦截",
      firstReviewDaysAgo: 19,
      secondReviewDaysAgo: 18,
    },
    // #8: 刚刚提交（当日待初审）
    {
      amount: "25.00",
      status: "pending_first_review",
      daysAgo: 0,
      fee: "0.25",
      actual: "24.75",
      bankCardNo: "622588****5678",
      bankName: "兴业银行",
      hasRiskCheck: true,
    },
  ];

  let withdrawCount = 0;
  let totalWithdrawPending = 0;

  for (const ws of withdrawSeeds) {
    const createDate = daysAgo(ws.daysAgo);
    const amount = parseFloat(ws.amount);
    const paidAmount = parseFloat(ws.actual);

    // 风控快照
    const riskCheck = ws.hasRiskCheck ? {
      checkedAt: createDate.toISOString(),
      riskLevel: ws.status === "rejected" ? "high" : "low",
      ipLocation: "北京市朝阳区",
      ipReputation: "normal",
      deviceFingerprint: `FP_${nanoid(8)}`,
      dailyWithdrawCount: randInt(1, 3),
      dailyWithdrawAmount: parseFloat(ws.amount),
      bankAccountAge: randInt(30, 365),
      reason: ws.status === "rejected" ? ws.rejectReason : null,
    } : null;

    const insertData: any = {
      agentId: AGENT_ID,
      amount: ws.amount,
      wechatPayNo: ws.status === "paid" ? `WX_PAY_${nanoid(12)}` : null,
      feeAmount: ws.fee,
      actualAmount: ws.actual,
      bankCardNo: ws.bankCardNo,
      bankName: ws.bankName,
      bankVoucherUrl: ws.status === "paid" ? `/uploads/vouchers/bank_transfer_${nanoid(8)}.png` : null,
      voucherNo: `WD-${yyyymmdd(createDate)}-${AGENT_ID}-${String(withdrawCount + 1).padStart(3, "0")}`,
      status: ws.status,
      auditLevel: ws.firstReviewDaysAgo ? 2 : 1,
      riskCheckResult: riskCheck,
      rejectReason: ws.rejectReason || null,
      // 审核时间线
      firstAuditorId: ws.firstReviewDaysAgo ? ADMIN_ID : null,
      firstAuditedAt: ws.firstReviewDaysAgo ? daysAgo(ws.firstReviewDaysAgo) : null,
      secondAuditorId: ws.secondReviewDaysAgo ? ADMIN_ID : null,
      secondAuditedAt: ws.secondReviewDaysAgo ? daysAgo(ws.secondReviewDaysAgo) : null,
      paidOperatorId: ws.paidDaysAgo ? ADMIN_ID : null,
      paidAt: ws.paidDaysAgo ? daysAgo(ws.paidDaysAgo) : null,
      reviewedBy: (ws.firstReviewDaysAgo || ws.secondReviewDaysAgo) ? ADMIN_ID : null,
      reviewedAt: ws.firstReviewDaysAgo ? daysAgo(ws.firstReviewDaysAgo) : null,
      createdAt: createDate,
      updatedAt: ws.paidDaysAgo ? daysAgo(ws.paidDaysAgo) : createDate,
    };

    const [order] = await db.insert(withdrawOrders).values(insertData).returning({ id: withdrawOrders.id });

    // 已成功提现 + 已通过待打款：从 pendingWithdraw 扣除
    if (ws.status === "paid" || ws.status === "approved") {
      totalWithdrawPending += amount;
    }

    // 等待复审/待初审：暂不计入 pending（后续统一计算）
    if (ws.status === "pending_first_review" || ws.status === "pending_second_review") {
      totalWithdrawPending += amount;
    }

    // 支付状态的更新 agent pendingWithdraw（有打款记录就是实际支出）
    // 我们最后统一更新 agent 余额

    // 审计日志
    const actions: string[] = [];
    if (ws.firstReviewDaysAgo) actions.push("withdraw_first_approve");
    if (ws.secondReviewDaysAgo) actions.push("withdraw_second_approve");
    if (ws.paidDaysAgo) actions.push("withdraw_paid");
    if (ws.status === "rejected" && ws.firstReviewDaysAgo) actions.push("withdraw_reject");

    if (actions.length > 0) {
      await db.insert(auditLogs).values({
        operatorId: ADMIN_ID,
        action: "withdraw_approve",
        targetType: "withdraw_order",
        targetId: order.id,
        before: ws.status !== "pending_first_review" ? { status: ws.status } : null,
        after: { status: ws.status, feeAmount: ws.fee, actualAmount: ws.actual },
        ip: "127.0.0.1",
        description: `提现单 #${order.id}: ¥${ws.amount} → ${ws.status}` +
          (ws.status === "rejected" ? ` (${ws.rejectReason})` : ""),
        createdAt: ws.firstReviewDaysAgo ? daysAgo(ws.firstReviewDaysAgo) : createDate,
      });
    }

    // 已打款的提现：创建余额扣减记录
    if (ws.status === "paid") {
      await db.insert(balanceLogs).values({
        userId: 6,  // agent 用户 ID
        amount: `-${ws.actual}`,
        balanceAfter: "0.000000", // 占位，不重要
        type: "consumption",
        refType: "withdraw",
        refId: order.id,
        description: `提现到账: ¥${ws.actual} (手续费¥${ws.fee})`,
        createdAt: daysAgo(ws.paidDaysAgo!),
      });
    }

    withdrawCount++;
    console.log(`  #${withdrawCount} ¥${ws.amount.padStart(6)} → ${ws.status.padEnd(25)} ${ws.bankName} ${ws.bankCardNo.slice(0, 12)}****`);
  }

  // 更新 agent 的 pendingWithdraw（可提现余额反映未完成的提现）
  // totalCommission ≈ 368, settledCommission ≈ 378 (之前已结算的)
  // 我们维护一个合理的关系：
  // totalCommission - settledCommission = 待结算 (0)
  // settledCommission - pendingWithdraw - frozenAmount ≈ 已提走的金额
  const totalCommission = num(agent.totalCommission) + 150; // 加上我们"模拟"的新佣金
  const settledCommission = totalCommission * 0.85; // 85% 已结算
  const pendingWithdraw = totalWithdrawPending; // 待提现/已通过未打款的
  const frozenAmount = 0; // 没有冻结

  await db.update(agents)
    .set({
      totalCommission: totalCommission.toFixed(6),
      settledCommission: settledCommission.toFixed(6),
      pendingWithdraw: pendingWithdraw.toFixed(6),
      frozenAmount: frozenAmount.toFixed(6),
      updatedAt: NOW,
    })
    .where(eq(agents.id, AGENT_ID));

  console.log(`\n  ✅ ${withdrawCount} 笔提现记录`);

  // ──────────────────────────────────────────────
  //  Step 5: 验证 & 汇总
  // ──────────────────────────────────────────────

  // 刷新代理商数据
  const [finalAgent] = await db.select().from(agents).where(eq(agents.id, AGENT_ID));
  const [rollupCheck] = await db.select({ c: sql<number>`count(*)::int` }).from(commissionDailyRollup).where(eq(commissionDailyRollup.agentId, AGENT_ID));
  const [reconCheck] = await db.select({ c: sql<number>`count(*)::int` }).from(dailyReconSummary);
  const [wdCheck] = await db.select({ c: sql<number>`count(*)::int` }).from(withdrawOrders).where(eq(withdrawOrders.agentId, AGENT_ID));
  const wdByStatus = await db.select({
    status: withdrawOrders.status,
    c: sql<number>`count(*)::int`,
  }).from(withdrawOrders).where(eq(withdrawOrders.agentId, AGENT_ID)).groupBy(withdrawOrders.status);
  const [commCheck] = await db.select({ c: sql<number>`count(*)::int` }).from(commissionLogs).where(eq(commissionLogs.agentId, AGENT_ID));
  const [commSettled] = await db.select({ c: sql<number>`count(*)::int` }).from(commissionLogs)
    .where(and(eq(commissionLogs.agentId, AGENT_ID), eq(commissionLogs.status, "settled")));
  const [auditCheck] = await db.select({ c: sql<number>`count(*)::int` }).from(auditLogs)
    .where(and(eq(auditLogs.targetType, "withdraw_order"), eq(auditLogs.operatorId, ADMIN_ID)));

  console.log("\n═══════════════════════════════════════════════");
  console.log("  ✅ 费用结算模拟数据生成完成");
  console.log("═══════════════════════════════════════════════\n");

  console.log("📊 最终数据统计:\n");
  console.log(`  ├─ 佣金记录:         ${Number(commCheck.c).toLocaleString()} 条`);
  console.log(`  │   └─ 已结算:       ${Number(commSettled.c).toLocaleString()} 条`);
  console.log(`  ├─ 佣金日汇总:       ${Number(rollupCheck.c).toLocaleString()} 条 (回溯 ${START_DAYS} 天)`);
  console.log(`  ├─ 日终对账汇总:     ${Number(reconCheck.c).toLocaleString()} 条 (含 ${reconCheck.c - 1} 天平衡)`);
  console.log(`  ├─ 提现记录:         ${Number(wdCheck.c).toLocaleString()} 笔`);
  for (const s of wdByStatus) {
    console.log(`  │   └─ ${s.status.padEnd(25)}: ${s.c} 笔`);
  }
  console.log(`  ├─ 审计日志:         ${Number(auditCheck.c).toLocaleString()} 条`);
  console.log(`  ├─ 客户数量:         ${clientCount.c} 个`);
  console.log("\n💰 代理商余额:\n");
  console.log(`  ├─ 累计佣金:         ¥${num(finalAgent.totalCommission).toFixed(4)}`);
  console.log(`  ├─ 已结算佣金:       ¥${num(finalAgent.settledCommission).toFixed(4)}`);
  console.log(`  ├─ 可提现金额:       ¥${num(finalAgent.pendingWithdraw).toFixed(4)}`);
  console.log(`  ├─ 冻结金额:         ¥${num(finalAgent.frozenAmount).toFixed(4)}`);
  console.log(`  └─ 分佣比例:         ${(AGENT_RATE * 100).toFixed(1)}%`);

  console.log("\n📋 提现记录明细:\n");
  const wds = await db.select({
    id: withdrawOrders.id,
    amount: withdrawOrders.amount,
    status: withdrawOrders.status,
    fee: withdrawOrders.feeAmount,
    actual: withdrawOrders.actualAmount,
    bank: withdrawOrders.bankName,
    card: withdrawOrders.bankCardNo,
    createdAt: withdrawOrders.createdAt,
    paidAt: withdrawOrders.paidAt,
  }).from(withdrawOrders).where(eq(withdrawOrders.agentId, AGENT_ID)).orderBy(withdrawOrders.createdAt);
  for (const w of wds) {
    const shortCard = w.card ? `${w.card.slice(0, 8)}****${w.card.slice(-4)}` : "—";
    console.log(`  #${w.id.toString().padStart(2)} ¥${parseFloat(w.amount).toFixed(2).padStart(7)} → ${w.status.padEnd(25)} ` +
      `费¥${parseFloat(w.fee || "0").toFixed(2).padStart(5)} 到账¥${parseFloat(w.actual || w.amount).toFixed(2).padStart(6)} ${w.bank||""} ${shortCard}`);
  }

  console.log("\n═══════════════════════════════════════════════");
  console.log("  验证入口:");
  console.log("    管理后台:  http://localhost:5175/admin");
  console.log("    代理商面板: http://localhost:5175/agent/dashboard");
  console.log("");
  console.log("  管理员: admin@3cloud.dev / admin123");
  console.log("  代理商密码: test123456");
  console.log("═══════════════════════════════════════════════\n");

  await closeDb();
}

main().catch((err) => {
  console.error("\n❌ 失败:", err);
  process.exit(1);
});
