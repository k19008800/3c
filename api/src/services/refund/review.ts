// ============================================================
//  3cloud (3C) — 退款服务 — 审核操作
// ============================================================

import { eq, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { refundRequests, users, balanceLogs, auditLogs } from "../../db/schema.js";
import { AppError } from "../auth-service/index.js";

export async function approveRefund(refundId: number, reviewerId: number) {
  const db = getDb();
  const [record] = await db.select().from(refundRequests).where(eq(refundRequests.id, refundId)).limit(1);
  if (!record) throw new AppError("REFUND_NOT_FOUND", "退款申请不存在", 404);
  if (record.status !== "pending") throw new AppError("INVALID_STATUS", `当前状态为 ${record.status}，无法审核通过`, 400);

  const now = new Date();
  const amount = record.amount;

  await db.transaction(async (tx) => {
    await tx.update(refundRequests).set({ status: "completed", reviewerId, reviewedAt: now, completedAt: now, updatedAt: now }).where(eq(refundRequests.id, refundId));
    await tx.update(users).set({ balance: sql`${users.balance} - ${amount}` }).where(eq(users.id, record.userId));

    const [currentUser] = await tx.select({ balance: users.balance }).from(users).where(eq(users.id, record.userId)).limit(1);

    await tx.insert(balanceLogs).values({ userId: record.userId, amount: `-${amount}`, balanceAfter: currentUser!.balance, type: "refund", refType: "refund", refId: refundId, description: `退款审核通过 / ${record.refundType} / ${record.reason}` });
    await tx.insert(auditLogs).values({ operatorId: reviewerId, action: "balance_adjust", targetType: "refund", targetId: refundId, before: sql`jsonb_build_object('status', ${record.status}::text, 'userId', ${record.userId}::text, 'amount', ${amount}::text)`, after: sql`jsonb_build_object('status', 'completed', 'amount', ${amount}::text)`, description: `退款审核通过 #${refundId}：用户 ${record.userId}，金额 ${amount}，类型 ${record.refundType}` });
  });

  return { id: refundId, status: "completed" as const, completedAt: now.toISOString() };
}

export async function rejectRefund(refundId: number, reviewerId: number, reason: string) {
  const db = getDb();
  const [record] = await db.select().from(refundRequests).where(eq(refundRequests.id, refundId)).limit(1);
  if (!record) throw new AppError("REFUND_NOT_FOUND", "退款申请不存在", 404);
  if (record.status !== "pending") throw new AppError("INVALID_STATUS", `当前状态为 ${record.status}，无法拒绝`, 400);
  if (!reason) throw new AppError("REASON_REQUIRED", "拒绝原因不能为空", 400);

  const now = new Date();
  const [updated] = await db.update(refundRequests).set({ status: "rejected", reviewerId, reviewedAt: now, rejectReason: reason, updatedAt: now }).where(eq(refundRequests.id, refundId)).returning();
  return updated;
}
