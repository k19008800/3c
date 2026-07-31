// ============================================================
//  3cloud (3C) — 资金账户管理服务（SPEC-§29.2）
//  平台资金总览：充值/消费/供应商结算/佣金/毛利
//  冻结资金明细：代理待结算佣金/未确认充值/进行中提现/退款待处理
//  资金变动趋势（近 N 天）
// ============================================================

import { eq, and, sql, desc, gte, lte } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  balanceLogs,
  rechargeOrders,
  withdrawOrders,
  refundRequests,
  users,
  agents,
  agentSettlements,
  vendorSettlements,
  platformLedger,
} from "../db/schema.js";

// 检查表是否在 schema 中存在（防御性）
function hasTable(name: string): boolean {
  try {
    return !!require("../db/schema.js")[name];
  } catch {
    return false;
  }
}

// ── 资金账户总览 ──
export async function getAccountsOverview() {
  const db = getDb();

  // 1. 用户充值总额（confirmed 状态的充值）
  const [recharge] = await db
    .select({
      total: sql<string>`coalesce(sum(${rechargeOrders.amount}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(rechargeOrders)
    .where(eq(rechargeOrders.status, "confirmed"));

  // 2. 用户消费总额（balance_logs 中 consumption 类型）
  const [consumption] = await db
    .select({
      total: sql<string>`coalesce(sum(abs(${balanceLogs.amount})), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(balanceLogs)
    .where(eq(balanceLogs.type, "consumption"));

  // 3. 已结算给供应商（vendor_settlements 中 confirmed/paid 状态）
  let settledToVendor = "0";
  let pendingVendorSettlement = "0";
  try {
    const [vendorSettled] = await db
      .select({ total: sql<string>`coalesce(sum(${vendorSettlements.totalAmount}), 0)` })
      .from(vendorSettlements)
      .where(sql`${vendorSettlements.status} IN ('confirmed', 'settled')`);
    settledToVendor = String(vendorSettled?.total ?? 0);

    const [vendorPending] = await db
      .select({ total: sql<string>`coalesce(sum(${vendorSettlements.totalAmount}), 0)` })
      .from(vendorSettlements)
      .where(sql`${vendorSettlements.status} = 'pending'`);
    pendingVendorSettlement = String(vendorPending?.total ?? 0);
  } catch {
    // 表可能不存在，忽略
  }

  // 4. 代理佣金：已发放 + 待结算
  let agentCommissionPaid = "0";
  let agentCommissionPending = "0";
  try {
    const [paid] = await db
      .select({ total: sql<string>`coalesce(sum(${agentSettlements.settledAmount}), 0)` })
      .from(agentSettlements)
      .where(sql`${agentSettlements.status} IN ('settled', 'confirmed', 'auto_confirmed')`);
    agentCommissionPaid = String(paid?.total ?? 0);

    const [pending] = await db
      .select({ total: sql<string>`coalesce(sum(${agentSettlements.settledAmount}), 0)` })
      .from(agentSettlements)
      .where(sql`${agentSettlements.status} = 'pending'`);
    agentCommissionPending = String(pending?.total ?? 0);
  } catch {
    // 表可能不存在，忽略
  }

  // 5. 冻结资金明细
  // 5.1 未确认充值（pending 且未复审通过；首审通过但未复审的也计入）
  const [pendingRecharge] = await db
    .select({ total: sql<string>`coalesce(sum(${rechargeOrders.amount}), 0)` })
    .from(rechargeOrders)
    .where(and(eq(rechargeOrders.status, "pending"), sql`${rechargeOrders.secondConfirmedBy} IS NULL`));

  // 5.2 进行中提现（pending_first_review/pending_second_review/approved）
  const [pendingWithdraw] = await db
    .select({ total: sql<string>`coalesce(sum(${withdrawOrders.amount}), 0)` })
    .from(withdrawOrders)
    .where(sql`${withdrawOrders.status} IN ('pending_first_review', 'pending_second_review', 'approved')`);

  // 5.3 退款待处理（pending）
  const [pendingRefund] = await db
    .select({ total: sql<string>`coalesce(sum(${refundRequests.amount}), 0)` })
    .from(refundRequests)
    .where(eq(refundRequests.status, "pending"));

  // 汇总
  const rechargeTotal = parseFloat(String(recharge?.total ?? 0));
  const consumptionTotal = parseFloat(String(consumption?.total ?? 0));
  const vendorSettledNum = parseFloat(settledToVendor);
  const vendorPendingNum = parseFloat(pendingVendorSettlement);
  const commissionPaidNum = parseFloat(agentCommissionPaid);
  const commissionPendingNum = parseFloat(agentCommissionPending);

  // 毛利 = 用户消费 - 供应商已结算 - 佣金已发放
  const grossProfit = consumptionTotal - vendorSettledNum - commissionPaidNum;
  const grossMargin = consumptionTotal > 0 ? (grossProfit / consumptionTotal) * 100 : 0;

  const frozenDetail = [
    { label: "代理待结算佣金", amount: commissionPendingNum },
    { label: "未确认充值", amount: parseFloat(String(pendingRecharge?.total ?? 0)) },
    { label: "进行中提现", amount: parseFloat(String(pendingWithdraw?.total ?? 0)) },
    { label: "退款待处理", amount: parseFloat(String(pendingRefund?.total ?? 0)) },
  ];
  const frozenBalance = frozenDetail.reduce((s, f) => s + f.amount, 0);

  // 平台总余额（所有用户余额之和 + 平台 ledger 净额）
  const [userBalances] = await db
    .select({ total: sql<string>`coalesce(sum(${users.balance}), 0)` })
    .from(users);
  const totalUserBalance = parseFloat(String(userBalances?.total ?? 0));

  const [ledgerNet] = await db
    .select({
      total: sql<string>`coalesce(sum(CASE WHEN ${platformLedger.direction} = 'in' THEN ${platformLedger.amount} ELSE -${platformLedger.amount} END), 0)`,
    })
    .from(platformLedger);
  const ledgerNetNum = parseFloat(String(ledgerNet?.total ?? 0));

  const totalBalance = totalUserBalance + ledgerNetNum;
  const availableBalance = totalBalance - frozenBalance;

  return {
    totalBalance: totalBalance.toFixed(2),
    availableBalance: availableBalance.toFixed(2),
    frozenBalance: frozenBalance.toFixed(2),
    frozenDetail: frozenDetail.map((f) => ({ ...f, amount: f.amount.toFixed(2) })),
    composition: {
      userRechargeTotal: rechargeTotal.toFixed(2),
      rechargeCount: recharge?.count ?? 0,
      userConsumptionTotal: consumptionTotal.toFixed(2),
      consumptionCount: consumption?.count ?? 0,
      settledToVendor: vendorSettledNum.toFixed(2),
      pendingVendorSettlement: vendorPendingNum.toFixed(2),
      agentCommissionPaid: commissionPaidNum.toFixed(2),
      agentCommissionPending: commissionPendingNum.toFixed(2),
      platformGrossProfit: grossProfit.toFixed(2),
      platformGrossMargin: grossMargin.toFixed(2),
    },
    summary: {
      userBalanceTotal: totalUserBalance.toFixed(2),
      ledgerNet: ledgerNetNum.toFixed(2),
    },
  };
}

// ── 资金变动趋势（近 N 天，默认 30） ──
export async function getAccountsTrend(days: number = 30) {
  const db = getDb();
  const n = Math.min(90, Math.max(7, days));
  const startDate = new Date(Date.now() - (n - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // 按日聚合用户余额变动（balance_logs）
  const dailyBalances = await db
    .select({
      date: sql<string>`to_char(${balanceLogs.createdAt}, 'YYYY-MM-DD')`,
      inAmount: sql<string>`coalesce(sum(CASE WHEN ${balanceLogs.amount} > 0 THEN ${balanceLogs.amount} ELSE 0 END), 0)`,
      outAmount: sql<string>`coalesce(sum(CASE WHEN ${balanceLogs.amount} < 0 THEN abs(${balanceLogs.amount}) ELSE 0 END), 0)`,
    })
    .from(balanceLogs)
    .where(gte(sql`DATE(${balanceLogs.createdAt})`, startDate))
    .groupBy(sql`to_char(${balanceLogs.createdAt}, 'YYYY-MM-DD')`);

  // 按日聚合平台 ledger
  let dailyLedger: any[] = [];
  try {
    dailyLedger = await db
      .select({
        date: sql<string>`to_char(${platformLedger.createdAt}, 'YYYY-MM-DD')`,
        inAmount: sql<string>`coalesce(sum(CASE WHEN ${platformLedger.direction} = 'in' THEN ${platformLedger.amount} ELSE 0 END), 0)`,
        outAmount: sql<string>`coalesce(sum(CASE WHEN ${platformLedger.direction} = 'out' THEN ${platformLedger.amount} ELSE 0 END), 0)`,
      })
      .from(platformLedger)
      .where(gte(sql`DATE(${platformLedger.createdAt})`, startDate))
      .groupBy(sql`to_char(${platformLedger.createdAt}, 'YYYY-MM-DD')`);
  } catch {
    // 表空或不存在，忽略
  }

  // 构建日期序列
  const map = new Map<string, { date: string; inflow: number; outflow: number }>();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    map.set(d, { date: d, inflow: 0, outflow: 0 });
  }
  for (const r of dailyBalances) {
    const entry = map.get(r.date);
    if (entry) {
      entry.inflow += parseFloat(String(r.inAmount));
      entry.outflow += parseFloat(String(r.outAmount));
    }
  }
  for (const r of dailyLedger) {
    const entry = map.get(r.date);
    if (entry) {
      entry.inflow += parseFloat(String(r.inAmount));
      entry.outflow += parseFloat(String(r.outAmount));
    }
  }

  // 计算累计余额（从起始日用户余额快照 + 每日净流入）
  const [startSnapshot] = await db
    .select({ total: sql<string>`coalesce(sum(${users.balance}), 0)` })
    .from(users)
    .where(sql`${users.createdAt} <= ${startDate + " 23:59:59"}`);

  let running = parseFloat(String(startSnapshot?.total ?? 0));
  const trend = Array.from(map.values()).map((d) => {
    running += d.inflow - d.outflow;
    return {
      date: d.date,
      inflow: d.inflow.toFixed(2),
      outflow: d.outflow.toFixed(2),
      net: (d.inflow - d.outflow).toFixed(2),
      balance: running.toFixed(2),
    };
  });

  return { trend, days: n };
}
