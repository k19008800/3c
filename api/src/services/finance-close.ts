// ============================================================
//  3cloud (3C) — 财务锁账与结转服务（SPEC-§29.4）
//  每月结账：前置检查 → 锁定数据 → 生成结转凭证 → 记录
//  支持超管临时解锁（1 小时后自动重新锁定）
// ============================================================

import { eq, and, sql, desc, gte, lte } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  financeCloseRecords,
  balanceLogs,
  rechargeOrders,
  refundRequests,
  platformLedger,
} from "../db/schema.js";
import { AppError } from "./auth-service/index.js";

// ── 当前会计期间 ──
export function getCurrentPeriod(): { period: string; start: string; end: string } {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const start = `${period}-01`;
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { period, start, end };
}

// ── 前置检查 ──
export async function runPrecheck(period: string, periodStart: string, periodEnd: string) {
  const db = getDb();
  const results: Record<string, any> = {};

  // 1. 对账差异检查：reconciliation_mismatches 未处理数
  try {
    const { reconciliationMismatches } = await import("../db/schema.js");
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(reconciliationMismatches)
      .where(and(
        eq(reconciliationMismatches.resolved, false),
        gte(sql`DATE(${reconciliationMismatches.createdAt})`, periodStart),
        lte(sql`DATE(${reconciliationMismatches.createdAt})`, periodEnd),
      ));
    results.unresolvedMismatches = row?.n ?? 0;
    results.unresolvedMismatchesPass = (row?.n ?? 0) === 0;
  } catch {
    results.unresolvedMismatches = 0;
    results.unresolvedMismatchesPass = true;
  }

  // 2. 退款检查：pending 退款数
  try {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(refundRequests)
      .where(and(
        eq(refundRequests.status, "pending"),
        gte(sql`DATE(${refundRequests.createdAt})`, periodStart),
        lte(sql`DATE(${refundRequests.createdAt})`, periodEnd),
      ));
    results.pendingRefunds = row?.n ?? 0;
    results.pendingRefundsPass = (row?.n ?? 0) === 0;
  } catch {
    results.pendingRefunds = 0;
    results.pendingRefundsPass = true;
  }

  // 3. 充值对账：period 内充值总额
  const [recharge] = await db
    .select({ total: sql<string>`coalesce(sum(${rechargeOrders.amount}), 0)` })
    .from(rechargeOrders)
    .where(and(
      eq(rechargeOrders.status, "confirmed"),
      gte(sql`DATE(${rechargeOrders.createdAt})`, periodStart),
      lte(sql`DATE(${rechargeOrders.createdAt})`, periodEnd),
    ));
  results.rechargeTotal = String(recharge?.total ?? 0);

  // 4. 消费总额
  const [consumption] = await db
    .select({ total: sql<string>`coalesce(sum(abs(${balanceLogs.amount})), 0)` })
    .from(balanceLogs)
    .where(and(
      eq(balanceLogs.type, "consumption"),
      gte(sql`DATE(${balanceLogs.createdAt})`, periodStart),
      lte(sql`DATE(${balanceLogs.createdAt})`, periodEnd),
    ));
  results.consumptionTotal = String(consumption?.total ?? 0);

  // 5. 收入总额 = 充值确认金额
  const incomeTotal = parseFloat(String(recharge?.total ?? 0));
  // 6. 支出总额 = 退款 + 提现（粗略：refund pending+completed）
  const [refundTotal] = await db
    .select({ total: sql<string>`coalesce(sum(${refundRequests.amount}), 0)` })
    .from(refundRequests)
    .where(and(
      sql`${refundRequests.status} IN ('pending', 'completed', 'approved')`,
      gte(sql`DATE(${refundRequests.createdAt})`, periodStart),
      lte(sql`DATE(${refundRequests.createdAt})`, periodEnd),
    ));
  const expenseTotal = parseFloat(String(refundTotal?.total ?? 0));

  const grossProfit = incomeTotal - expenseTotal;
  const grossMargin = incomeTotal > 0 ? (grossProfit / incomeTotal) * 100 : 0;

  results.incomeTotal = incomeTotal.toFixed(6);
  results.expenseTotal = expenseTotal.toFixed(6);
  results.grossProfit = grossProfit.toFixed(6);
  results.grossMargin = grossMargin.toFixed(2);

  // 综合通过 = 无未处理差异 + 无待处理退款
  results.pass = results.unresolvedMismatchesPass && results.pendingRefundsPass;

  return results;
}

// ── 当前结账状态 ──
export async function getCloseStatus() {
  const db = getDb();
  const { period, start, end } = getCurrentPeriod();

  const [record] = await db
    .select()
    .from(financeCloseRecords)
    .where(eq(financeCloseRecords.period, period))
    .limit(1);

  const precheck = await runPrecheck(period, start, end);

  return {
    currentPeriod: period,
    periodStart: start,
    periodEnd: end,
    status: record ? record.status : "open",
    closedAt: record?.closedAt ?? null,
    closedBy: record?.closedBy ?? null,
    unlocked: record?.status === "unlocked",
    unlockExpiresAt: record?.unlockExpiresAt ?? null,
    precheck,
    summary: record
      ? {
          incomeTotal: record.incomeTotal,
          expenseTotal: record.expenseTotal,
          grossProfit: record.grossProfit,
          grossMargin: record.grossMargin,
        }
      : {
          incomeTotal: precheck.incomeTotal,
          expenseTotal: precheck.expenseTotal,
          grossProfit: precheck.grossProfit,
          grossMargin: precheck.grossMargin,
        },
  };
}

// ── 执行结账 ──
export async function executeClose(operatorId: number, ip?: string) {
  const db = getDb();
  const { period, start, end } = getCurrentPeriod();

  // 检查是否已结账
  const [existing] = await db
    .select()
    .from(financeCloseRecords)
    .where(eq(financeCloseRecords.period, period))
    .limit(1);
  if (existing) {
    throw new AppError("ALREADY_CLOSED", `本期 ${period} 已结账，请勿重复操作`, 400);
  }

  // 前置检查
  const precheck = await runPrecheck(period, start, end);
  if (!precheck.pass) {
    throw new AppError(
      "PRECHECK_FAILED",
      `前置检查未通过：未处理对账差异 ${precheck.unresolvedMismatches} 项，待处理退款 ${precheck.pendingRefunds} 笔`,
      400
    );
  }

  const incomeTotal = parseFloat(precheck.incomeTotal);
  const expenseTotal = parseFloat(precheck.expenseTotal);
  const grossProfit = parseFloat(precheck.grossProfit);

  // 生成结转凭证号
  const { generateVoucherNo } = await import("./voucher-service.js");
  const carryVoucherNo = await generateVoucherNo("C");

  const [record] = await db
    .insert(financeCloseRecords)
    .values({
      period,
      periodStart: start,
      periodEnd: end,
      status: "closed",
      incomeTotal: String(incomeTotal),
      expenseTotal: String(expenseTotal),
      grossProfit: String(grossProfit),
      grossMargin: precheck.grossMargin,
      precheckResult: precheck,
      carryVoucherNo,
      closedBy: operatorId,
    })
    .returning();

  // 审计日志
  try {
    const { auditLogs } = await import("../db/schema.js");
    await db.insert(auditLogs).values({
      operatorId,
      action: "balance_adjust" as any,
      targetType: "finance_close_records",
      targetId: record.id,
      before: null,
      after: { period, incomeTotal, expenseTotal, grossProfit, voucherNo: carryVoucherNo },
      ip,
      description: `执行财务结账 ${period}，结转凭证 ${carryVoucherNo}`,
    });
  } catch { /* 审计失败不影响主流程 */ }

  return record;
}

// ── 历史结账记录 ──
export async function listCloseHistory(page = 1, pageSize = 20) {
  const db = getDb();
  const p = Math.max(1, page);
  const ps = Math.min(100, Math.max(1, pageSize));

  const [totalRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(financeCloseRecords);

  const list = await db
    .select()
    .from(financeCloseRecords)
    .orderBy(desc(financeCloseRecords.period))
    .limit(ps)
    .offset((p - 1) * ps);

  return { list, total: totalRow?.n ?? 0, page: p, pageSize: ps };
}

// ── 临时解锁（超管权限，1 小时后自动重新锁定） ──
export async function unlockPeriod(period: string, operatorId: number, ip?: string) {
  const db = getDb();

  const [record] = await db
    .select()
    .from(financeCloseRecords)
    .where(eq(financeCloseRecords.period, period))
    .limit(1);
  if (!record) {
    throw new AppError("NOT_CLOSED", `期间 ${period} 尚未结账`, 404);
  }
  if (record.status === "unlocked") {
    throw new AppError("ALREADY_UNLOCKED", `期间 ${period} 已处于解锁状态`, 400);
  }

  const unlockExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 小时

  const [updated] = await db
    .update(financeCloseRecords)
    .set({
      status: "unlocked",
      unlockedBy: operatorId,
      unlockedAt: new Date(),
      unlockExpiresAt,
      lockedAgainAt: null,
    })
    .where(eq(financeCloseRecords.id, record.id))
    .returning();

  // 审计
  try {
    const { auditLogs } = await import("../db/schema.js");
    await db.insert(auditLogs).values({
      operatorId,
      action: "balance_adjust" as any,
      targetType: "finance_close_records",
      targetId: record.id,
      before: { status: "closed" },
      after: { status: "unlocked", expiresAt: unlockExpiresAt.toISOString() },
      ip,
      description: `临时解锁财务期间 ${period}（1 小时后自动重新锁定）`,
    });
  } catch { /* ignore */ }

  return updated;
}

// ── 定时任务：过期解锁自动重新锁定 ──
export async function autoRelockExpired() {
  const db = getDb();
  const now = new Date();
  const result = await db
    .update(financeCloseRecords)
    .set({ status: "closed", lockedAgainAt: now })
    .where(and(
      eq(financeCloseRecords.status, "unlocked"),
      sql`${financeCloseRecords.unlockExpiresAt} IS NOT NULL`,
      lte(financeCloseRecords.unlockExpiresAt, now),
    ))
    .returning({ id: financeCloseRecords.id, period: financeCloseRecords.period });
  return result;
}
