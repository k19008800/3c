// ============================================================
//  3cloud (3C) — 退款服务 — 申请与查询
// ============================================================

import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { refundRequests } from "../../db/schema.js";
import { AppError } from "../auth-service/index.js";

export async function createRefundRequest(
  userId: number,
  amount: string,
  refundType: "overcharge" | "service_issue" | "system_error" | "other",
  reason: string,
  refCallLogId?: number,
  refOrderId?: number,
) {
  const db = getDb();
  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) throw new AppError("INVALID_AMOUNT", "退款金额必须大于 0", 400);
  if (!reason || reason.trim().length === 0) throw new AppError("REASON_REQUIRED", "退款原因不能为空", 400);
  const validTypes = ["overcharge", "service_issue", "system_error", "other"];
  if (!validTypes.includes(refundType)) throw new AppError("INVALID_REFUND_TYPE", "无效的退款类型", 400);

  const [record] = await db.insert(refundRequests)
    .values({ userId, amount: amountNum.toFixed(6), refundType, reason, refCallLogId: refCallLogId ?? null, refOrderId: refOrderId ?? null, status: "pending" })
    .returning();
  return record;
}

export async function getUserRefunds(userId: number, page: number = 1, pageSize: number = 20) {
  const db = getDb();
  const offset = (page - 1) * pageSize;
  const conditions = [eq(refundRequests.userId, userId)];
  const [totalResult] = await db.select({ count: sql<number>`count(*)` }).from(refundRequests).where(and(...conditions));
  const total = Number(totalResult?.count ?? 0);
  const rows = await db.select().from(refundRequests).where(and(...conditions)).orderBy(desc(refundRequests.createdAt)).limit(pageSize).offset(offset);
  return { list: rows.map(r => ({ id: r.id, amount: r.amount, refundType: r.refundType, reason: r.reason, status: r.status, rejectReason: r.rejectReason, completedAt: r.completedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })), total, page, pageSize };
}

export async function listAllRefundRequests(page: number = 1, pageSize: number = 20, status?: string, userId?: number) {
  const db = getDb();
  const offset = (page - 1) * pageSize;
  const conditions: any[] = [sql`1=1`];
  if (status) conditions.push(eq(refundRequests.status, status));
  if (userId) conditions.push(eq(refundRequests.userId, userId));
  const [totalResult] = await db.select({ count: sql<number>`count(*)` }).from(refundRequests).where(and(...conditions));
  const total = Number(totalResult?.count ?? 0);
  const rows = await db.select().from(refundRequests).where(and(...conditions)).orderBy(desc(refundRequests.createdAt)).limit(pageSize).offset(offset);
  return { list: rows, total, page, pageSize };
}
