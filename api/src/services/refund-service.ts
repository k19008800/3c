// ============================================================
//  3cloud (3C) — 退款服务 (Business Logic)
// ============================================================
//
// ── 业务逻辑 ──
//
// 【退款状态机】
//   pending ──审核通过──> completed (余额扣减 + balance_logs + audit_logs)
//      │
//      └──审核拒绝──> rejected (含 rejectReason)
//   rejected: 终态, 不可再操作
//   completed: 终态, 余额已扣减
//
// 【退款申请 (createRefundRequest)】
//   - 金额: > 0, DECIMAL(18,6)
//   - 退款类型 (refundType): 'overcharge' (多扣费), 'service_issue' (服务问题), 'system_error' (系统错误), 'other' (其他)
//   - 原因: 非空
//   - 关联: refCallLogId (关联调用日志) / refOrderId (关联充值订单) — 可选
//   - 状态: 初始 'pending'
//
// 【用户退款列表 (getUserRefunds)】
//   - 分页, userId 强制过滤
//   - 返回: amount, refundType, reason, status, rejectReason, completedAt, createdAt
//
// 【管理员审核通过 (approveRefund) — 事务】
//   1. UPDATE refundRequests: status='completed', reviewerId, reviewedAt, completedAt
//   2. UPDATE users: balance = balance - amount (负数扣款)
//   3. INSERT balanceLogs: amount=-{amount}, balanceAfter, type='refund', refType='refund', refId=refundId
//      - description: "退款审核通过 / {refundType} / {reason}"
//   4. INSERT auditLogs: operatorId, action='balance_adjust', targetType='refund', description 含 userId+amount+type
//   - 状态保护: 仅 pending 可操作
//
// 【管理员审核拒绝 (rejectRefund)】
//   - refuseReason 非空验证
//   - UPDATE: status='rejected', reviewerId, reviewedAt, rejectReason
//   - 不操作余额 (仅状态变更)
//   - 状态保护: 仅 pending 可操作
//
// 【管理员列表 (listAllRefundRequests)】
//   - 筛选: status, userId
//   - 分页, createdAt DESC
//
// 【集成点】
//   - users 表: balance 字段扣减
//   - balance_logs: type='refund', amount 为负数
//   - audit_logs: 全量审计
//   - auth-service.ts: AppError

import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { refundRequests, users, balanceLogs, auditLogs } from "../db/schema.js";
import { AppError } from "./auth-service.js";

// ──────────────────────────────────────────────
//  用户提交退款申请
// ──────────────────────────────────────────────

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

  if (isNaN(amountNum) || amountNum <= 0) {
    throw new AppError("INVALID_AMOUNT", "退款金额必须大于 0", 400);
  }

  if (!reason || reason.trim().length === 0) {
    throw new AppError("REASON_REQUIRED", "退款原因不能为空", 400);
  }

  const validTypes = ["overcharge", "service_issue", "system_error", "other"];
  if (!validTypes.includes(refundType)) {
    throw new AppError("INVALID_REFUND_TYPE", "无效的退款类型", 400);
  }

  const [record] = await db
    .insert(refundRequests)
    .values({
      userId,
      amount: amountNum.toFixed(6),
      refundType,
      reason,
      refCallLogId: refCallLogId ?? null,
      refOrderId: refOrderId ?? null,
      status: "pending",
    })
    .returning();

  return record;
}

// ──────────────────────────────────────────────
//  用户查询自己的退款记录
// ──────────────────────────────────────────────

export async function getUserRefunds(
  userId: number,
  page: number = 1,
  pageSize: number = 20,
) {
  const db = getDb();
  const offset = (page - 1) * pageSize;

  const conditions = [eq(refundRequests.userId, userId)];

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(refundRequests)
    .where(and(...conditions));

  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select()
    .from(refundRequests)
    .where(and(...conditions))
    .orderBy(desc(refundRequests.createdAt))
    .limit(pageSize)
    .offset(offset);

  const list = rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    refundType: r.refundType,
    reason: r.reason,
    status: r.status,
    rejectReason: r.rejectReason,
    completedAt: r.completedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return { list, total, page, pageSize };
}

// ──────────────────────────────────────────────
//  管理员查看所有退款申请
// ──────────────────────────────────────────────

export async function listAllRefundRequests(
  page: number = 1,
  pageSize: number = 20,
  status?: string,
  userId?: number,
) {
  const db = getDb();
  const offset = (page - 1) * pageSize;

  const conditions: any[] = [sql`1=1`];
  if (status) {
    conditions.push(eq(refundRequests.status, status));
  }
  if (userId) {
    conditions.push(eq(refundRequests.userId, userId));
  }

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(refundRequests)
    .where(and(...conditions));

  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select()
    .from(refundRequests)
    .where(and(...conditions))
    .orderBy(desc(refundRequests.createdAt))
    .limit(pageSize)
    .offset(offset);

  return { list: rows, total, page, pageSize };
}

// ──────────────────────────────────────────────
//  管理员审核退款（含余额扣减）
// ──────────────────────────────────────────────

export async function approveRefund(refundId: number, reviewerId: number) {
  const db = getDb();

  const [record] = await db
    .select()
    .from(refundRequests)
    .where(eq(refundRequests.id, refundId))
    .limit(1);

  if (!record) {
    throw new AppError("REFUND_NOT_FOUND", "退款申请不存在", 404);
  }

  if (record.status !== "pending") {
    throw new AppError("INVALID_STATUS", `当前状态为 ${record.status}，无法审核通过`, 400);
  }

  const now = new Date();
  const amount = record.amount;

  await db.transaction(async (tx) => {
    // 更新退款申请状态
    await tx
      .update(refundRequests)
      .set({
        status: "completed",
        reviewerId,
        reviewedAt: now,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(refundRequests.id, refundId));

    // 扣减用户余额（负数充值）
    await tx
      .update(users)
      .set({
        balance: sql`${users.balance} - ${amount}`,
      })
      .where(eq(users.id, record.userId));

    // 查询扣减后的余额
    const [currentUser] = await tx
      .select({ balance: users.balance })
      .from(users)
      .where(eq(users.id, record.userId))
      .limit(1);

    // 写 balance_logs
    await tx.insert(balanceLogs).values({
      userId: record.userId,
      amount: `-${amount}`,
      balanceAfter: currentUser!.balance,
      type: "refund",
      refType: "refund",
      refId: refundId,
      description: `退款审核通过 / ${record.refundType} / ${record.reason}`,
    });

    // 写审计日志
    await tx.insert(auditLogs).values({
      operatorId: reviewerId,
      action: "balance_adjust",
      targetType: "refund",
      targetId: refundId,
      before: sql`jsonb_build_object('status', ${record.status}, 'userId', ${record.userId}, 'amount', ${amount})`,
      after: sql`jsonb_build_object('status', 'completed', 'amount', ${amount})`,
      description: `退款审核通过 #${refundId}：用户 ${record.userId}，金额 ${amount}，类型 ${record.refundType}`,
    });
  });

  return { id: refundId, status: "completed" as const, completedAt: now.toISOString() };
}

// ──────────────────────────────────────────────
//  管理员拒绝退款
// ──────────────────────────────────────────────

export async function rejectRefund(refundId: number, reviewerId: number, reason: string) {
  const db = getDb();

  const [record] = await db
    .select()
    .from(refundRequests)
    .where(eq(refundRequests.id, refundId))
    .limit(1);

  if (!record) {
    throw new AppError("REFUND_NOT_FOUND", "退款申请不存在", 404);
  }

  if (record.status !== "pending") {
    throw new AppError("INVALID_STATUS", `当前状态为 ${record.status}，无法拒绝`, 400);
  }

  if (!reason) {
    throw new AppError("REASON_REQUIRED", "拒绝原因不能为空", 400);
  }

  const now = new Date();
  const [updated] = await db
    .update(refundRequests)
    .set({
      status: "rejected",
      reviewerId,
      reviewedAt: now,
      rejectReason: reason,
      updatedAt: now,
    })
    .where(eq(refundRequests.id, refundId))
    .returning();

  return updated;
}
