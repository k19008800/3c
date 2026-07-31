// ============================================================
//  3cloud (3C) — 违约金与逾期管理服务（SPEC-§29.6）
//  信用额度授信用户的逾期还款：罚息计算、分级处理、催收通知
//  逾期 1-7 天: reminding 0.05%/天 | 8-15 天: collecting 0.1%/天
//  16-30 天: suspended（暂停额度）| >30 天: frozen（冻结）
// ============================================================

import { eq, and, sql, desc, gte, lte, or } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  creditAccounts,
  overdueRecords,
  users,
} from "../db/schema.js";
import { AppError } from "./auth-service/index.js";

// ── 罚息率配置 ──
const PENALTY_RATES: Record<string, number> = {
  reminding: 0.0005,   // 0.05%/天（1-7 天）
  collecting: 0.001,   // 0.1%/天（8-15 天）
  suspended: 0.001,    // 0.1%/天（16-30 天）
  frozen: 0.002,       // 0.2%/天（>30 天）
};

// ── 逾期阶段 ──
export function getOverdueStage(days: number): string {
  if (days <= 7) return "reminding";
  if (days <= 15) return "collecting";
  if (days <= 30) return "suspended";
  return "frozen";
}

// ── 罚息计算 ──
export function calcPenalty(amount: number, days: number, rateOverride?: number): number {
  if (days <= 0 || amount <= 0) return 0;
  const stage = getOverdueStage(days);
  const rate = rateOverride ?? PENALTY_RATES[stage] ?? 0.001;
  return Math.round(amount * rate * days * 100) / 100;
}

// ── 逾期列表 ──
export async function listOverdue(q: {
  stage?: string;
  status?: string;
  userId?: number;
  keyword?: string;
  page?: number;
  pageSize?: number;
}) {
  const db = getDb();
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));

  const conds: any[] = [sql`1=1`];
  if (q.stage) conds.push(eq(overdueRecords.stage, q.stage));
  if (q.status) conds.push(eq(overdueRecords.status, q.status));
  if (q.userId) conds.push(eq(overdueRecords.userId, q.userId));
  if (q.keyword) conds.push(or(
    sql`${users.email} ILIKE ${"%" + q.keyword + "%"}`,
    sql`${users.nickname} ILIKE ${"%" + q.keyword + "%"}`,
  ));

  const [totalRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(overdueRecords)
    .innerJoin(users, eq(overdueRecords.userId, users.id))
    .where(and(...conds));

  const list = await db
    .select({
      id: overdueRecords.id,
      userId: overdueRecords.userId,
      userEmail: users.email,
      userNickname: users.nickname,
      creditLimit: creditAccounts.creditLimit,
      usedAmount: creditAccounts.usedAmount,
      overdueDays: overdueRecords.overdueDays,
      overdueAmount: overdueRecords.overdueAmount,
      penaltyAmount: overdueRecords.penaltyAmount,
      stage: overdueRecords.stage,
      waived: overdueRecords.waived,
      waiveNote: overdueRecords.waivedNote,
      status: overdueRecords.status,
      notifySentAt: overdueRecords.notifySentAt,
      createdAt: overdueRecords.createdAt,
    })
    .from(overdueRecords)
    .innerJoin(users, eq(overdueRecords.userId, users.id))
    .innerJoin(creditAccounts, eq(overdueRecords.creditAccountId, creditAccounts.id))
    .where(and(...conds))
    .orderBy(desc(overdueRecords.overdueDays))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  // 重新计算最新罚息（基于当前逾期天数）
  const enriched = list.map((r) => ({
    ...r,
    creditLimit: String(r.creditLimit),
    usedAmount: String(r.usedAmount),
    overdueAmount: String(r.overdueAmount),
    penaltyAmount: String(r.penaltyAmount),
  }));

  return { list: enriched, total: totalRow?.n ?? 0, page, pageSize };
}

// ── 逾期统计 ──
export async function getOverdueStats() {
  const db = getDb();

  const [summary] = await db
    .select({
      total: sql<number>`count(*)::int`,
      totalOverdueAmount: sql<string>`coalesce(sum(${overdueRecords.overdueAmount}), 0)`,
      totalPenalty: sql<string>`coalesce(sum(${overdueRecords.penaltyAmount}), 0)`,
    })
    .from(overdueRecords)
    .where(eq(overdueRecords.status, "open"));

  const byStage = await db
    .select({
      stage: overdueRecords.stage,
      count: sql<number>`count(*)::int`,
      amount: sql<string>`coalesce(sum(${overdueRecords.overdueAmount}), 0)`,
    })
    .from(overdueRecords)
    .where(eq(overdueRecords.status, "open"))
    .groupBy(overdueRecords.stage);

  return {
    total: summary?.total ?? 0,
    totalOverdueAmount: String(summary?.totalOverdueAmount ?? 0),
    totalPenalty: String(summary?.totalPenalty ?? 0),
    byStage,
  };
}

// ── 减免罚息 ──
export async function waivePenalty(id: number, operatorId: number, note?: string) {
  const db = getDb();
  const [record] = await db
    .select()
    .from(overdueRecords)
    .where(eq(overdueRecords.id, id))
    .limit(1);
  if (!record) throw new AppError("NOT_FOUND", "逾期记录不存在", 404);
  if (record.waived) throw new AppError("ALREADY_WAIVED", "该记录已减免罚息", 400);

  const [updated] = await db
    .update(overdueRecords)
    .set({
      waived: true,
      waivedBy: operatorId,
      waivedAt: new Date(),
      waivedNote: note || "管理员减免",
      penaltyAmount: "0.00",
      updatedAt: new Date(),
    })
    .where(eq(overdueRecords.id, id))
    .returning();
  return updated;
}

// ── 暂停额度 ──
export async function suspendCredit(id: number, operatorId: number) {
  const db = getDb();
  const [record] = await db
    .select()
    .from(overdueRecords)
    .where(eq(overdueRecords.id, id))
    .limit(1);
  if (!record) throw new AppError("NOT_FOUND", "逾期记录不存在", 404);

  // 更新授信账户状态为 suspended
  await db
    .update(creditAccounts)
    .set({ status: "suspended", updatedAt: new Date() })
    .where(eq(creditAccounts.id, record.creditAccountId));

  // 更新逾期记录阶段
  const [updated] = await db
    .update(overdueRecords)
    .set({ stage: "suspended", updatedAt: new Date() })
    .where(eq(overdueRecords.id, id))
    .returning();

  // 审计
  try {
    const { auditLogs } = await import("../db/schema.js");
    await db.insert(auditLogs).values({
      operatorId,
      action: "balance_adjust" as any,
      targetType: "credit_accounts",
      targetId: record.creditAccountId,
      before: { status: "active" },
      after: { status: "suspended" },
      ip: undefined,
      description: `暂停用户 ${record.userId} 的信用额度（逾期 ${record.overdueDays} 天）`,
    });
  } catch { /* ignore */ }

  return updated;
}

// ── 批量催收通知（记录通知时间） ──
export async function batchNotifyOverdue(operatorId: number, ids?: number[]) {
  const db = getDb();
  const conds: any[] = [eq(overdueRecords.status, "open")];
  if (ids?.length) {
    conds.push(sql`${overdueRecords.id} = ANY(ARRAY[${sql.join(ids.map((i) => sql`${i}::int`), sql`, `)}])`);
  }
  const [result] = await db
    .update(overdueRecords)
    .set({ notifySentAt: new Date(), updatedAt: new Date() })
    .where(and(...conds))
    .returning({ id: overdueRecords.id, userId: overdueRecords.userId });
  return result ? { notified: 1 } : { notified: 0 };
}

// ── 定时任务：刷新逾期天数与罚息（每日执行） ──
export async function refreshOverdue() {
  const db = getDb();
  // 找到所有 open 状态的授信账户中已用的（视为逾期——简化：used > 0 且超过宽限期）
  const accounts = await db
    .select({
      id: creditAccounts.id,
      userId: creditAccounts.userId,
      usedAmount: creditAccounts.usedAmount,
      interestRateDaily: creditAccounts.interestRateDaily,
      graceDays: creditAccounts.graceDays,
      nextBillingDate: creditAccounts.nextBillingDate,
    })
    .from(creditAccounts)
    .where(and(
      sql`${creditAccounts.status} IN ('active', 'suspended', 'frozen')`,
      sql`${creditAccounts.usedAmount} > 0`,
    ));

  let refreshed = 0;
  for (const acc of accounts) {
    // 简化逾期计算：从 next_billing_date 起算（无则从创建时间+宽限期）
    const baseDate = acc.nextBillingDate
      ? new Date(acc.nextBillingDate)
      : new Date(Date.now() - (acc.graceDays ?? 7) * 24 * 60 * 60 * 1000);
    const overdueDays = Math.max(0, Math.floor((Date.now() - baseDate.getTime()) / (24 * 60 * 60 * 1000)));
    if (overdueDays <= 0) continue;

    const overdueAmount = parseFloat(String(acc.usedAmount));
    const penalty = calcPenalty(overdueAmount, overdueDays);
    const stage = getOverdueStage(overdueDays);

    // upsert overdue record
    const [existing] = await db
      .select({ id: overdueRecords.id })
      .from(overdueRecords)
      .where(and(
        eq(overdueRecords.creditAccountId, acc.id),
        eq(overdueRecords.status, "open"),
      ))
      .limit(1);

    if (existing) {
      await db
        .update(overdueRecords)
        .set({
          overdueDays,
          overdueAmount: String(overdueAmount),
          penaltyAmount: String(penalty),
          stage,
          updatedAt: new Date(),
        })
        .where(eq(overdueRecords.id, existing.id));
    } else {
      await db.insert(overdueRecords).values({
        creditAccountId: acc.id,
        userId: acc.userId,
        overdueDays,
        overdueAmount: String(overdueAmount),
        penaltyAmount: String(penalty),
        stage,
      });
    }
    refreshed++;
  }
  return { refreshed };
}
