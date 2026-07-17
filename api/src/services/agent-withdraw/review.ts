// ============================================================
//  3cloud (3C) — 提现审核流程 (双审 + 打款 + 旧版兼容)
// ============================================================

import { eq, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  agents,
  withdrawOrders,
  auditLogs,
} from "../../db/schema.js";
import { AppError } from "../auth-service/index.js";
import { generateVoucherNo } from "../voucher-service.js";
import { num } from "../agent-helpers.js";

// ──────────────────────────────────────────────
//  初审
// ──────────────────────────────────────────────

export async function firstReviewWithdraw(
  operatorId: number,
  withdrawId: number,
  action: "approve" | "reject",
  rejectReason?: string | null,
) {
  const db = getDb();

  const [order] = await db
    .select()
    .from(withdrawOrders)
    .where(eq(withdrawOrders.id, withdrawId))
    .limit(1);

  if (!order) {
    throw new AppError("WITHDRAW_NOT_FOUND", "提现订单不存在", 404);
  }

  if (order.status !== "pending_first_review") {
    throw new AppError("INVALID_STATUS", `当前状态为 ${order.status}，无法初审`, 400);
  }

  await db.transaction(async (tx) => {
    if (action === "approve") {
      // 初审通过时生成凭证号
      const firstVoucherNo = await generateVoucherNo('B');

      await tx
        .update(withdrawOrders)
        .set({
          status: "pending_second_review",
          auditLevel: 2,
          firstAuditorId: operatorId,
          firstAuditedAt: new Date(),
          voucherNo: firstVoucherNo,
        })
        .where(eq(withdrawOrders.id, withdrawId));

      await tx.insert(auditLogs).values({
        operatorId,
        action: "withdraw_first_approve",
        targetType: "withdraw_orders",
        targetId: withdrawId,
        before: { status: "pending_first_review" },
        after: { status: "pending_second_review", voucherNo: firstVoucherNo },
        ip: null,
        description: `初审通过提现 #${withdrawId}，金额 ${order.amount}，凭证号 ${firstVoucherNo}`,
      });
    } else {
      // 拒绝时退还冻结金额
      await tx
        .update(agents)
        .set({
          pendingWithdraw: sql`${agents.pendingWithdraw} + ${order.amount}`,
        })
        .where(eq(agents.id, order.agentId));

      await tx
        .update(withdrawOrders)
        .set({
          status: "rejected",
          auditLevel: 1,
          firstAuditorId: operatorId,
          firstAuditedAt: new Date(),
          rejectReason: rejectReason ?? null,
        })
        .where(eq(withdrawOrders.id, withdrawId));

      await tx.insert(auditLogs).values({
        operatorId,
        action: "withdraw_reject",
        targetType: "withdraw_orders",
        targetId: withdrawId,
        before: { status: "pending_first_review" },
        after: { status: "rejected", rejectReason },
        ip: null,
        description: `初审拒绝提现 #${withdrawId}: ${rejectReason ?? "无原因"}`,
      });
    }
  });

  return {
    id: withdrawId,
    status: action === "approve" ? "pending_second_review" : "rejected",
  };
}

// ──────────────────────────────────────────────
//  复审
// ──────────────────────────────────────────────

export async function secondReviewWithdraw(
  operatorId: number,
  withdrawId: number,
  action: "approve" | "reject",
  rejectReason?: string | null,
  bankVoucherUrl?: string | null,
) {
  const db = getDb();

  const [order] = await db
    .select()
    .from(withdrawOrders)
    .where(eq(withdrawOrders.id, withdrawId))
    .limit(1);

  if (!order) {
    throw new AppError("WITHDRAW_NOT_FOUND", "提现订单不存在", 404);
  }

  if (order.status !== "pending_second_review") {
    throw new AppError("INVALID_STATUS", `当前状态为 ${order.status}，无法复审`, 400);
  }

  await db.transaction(async (tx) => {
    if (action === "approve") {
      // 复审通过时生成凭证号（若初审未生成则补充）
      const secondVoucherNo = order.voucherNo || await generateVoucherNo('B');

      await tx
        .update(withdrawOrders)
        .set({
          status: "approved",
          auditLevel: 2,
          secondAuditorId: operatorId,
          secondAuditedAt: new Date(),
          bankVoucherUrl: bankVoucherUrl ?? null,
          voucherNo: secondVoucherNo,
        })
        .where(eq(withdrawOrders.id, withdrawId));

      await tx.insert(auditLogs).values({
        operatorId,
        action: "withdraw_second_approve",
        targetType: "withdraw_orders",
        targetId: withdrawId,
        before: { status: "pending_second_review" },
        after: { status: "approved", voucherNo: secondVoucherNo },
        ip: null,
        description: `复审通过提现 #${withdrawId}，金额 ${order.amount}，凭证号 ${secondVoucherNo}`,
      });
    } else {
      // 拒绝时退还冻结金额
      await tx
        .update(agents)
        .set({
          pendingWithdraw: sql`${agents.pendingWithdraw} + ${order.amount}`,
        })
        .where(eq(agents.id, order.agentId));

      await tx
        .update(withdrawOrders)
        .set({
          status: "rejected",
          auditLevel: 2,
          secondAuditorId: operatorId,
          secondAuditedAt: new Date(),
          rejectReason: rejectReason ?? null,
        })
        .where(eq(withdrawOrders.id, withdrawId));

      await tx.insert(auditLogs).values({
        operatorId,
        action: "withdraw_reject",
        targetType: "withdraw_orders",
        targetId: withdrawId,
        before: { status: "pending_second_review" },
        after: { status: "rejected", rejectReason },
        ip: null,
        description: `复审拒绝提现 #${withdrawId}: ${rejectReason ?? "无原因"}`,
      });
    }
  });

  return {
    id: withdrawId,
    status: action === "approve" ? "approved" : "rejected",
  };
}

// ──────────────────────────────────────────────
//  打款确认
// ──────────────────────────────────────────────

export async function markWithdrawAsPaid(
  operatorId: number,
  withdrawId: number,
  bankVoucherUrl?: string | null,
) {
  const db = getDb();

  const [order] = await db
    .select()
    .from(withdrawOrders)
    .where(eq(withdrawOrders.id, withdrawId))
    .limit(1);

  if (!order) {
    throw new AppError("WITHDRAW_NOT_FOUND", "提现订单不存在", 404);
  }

  if (order.status !== "approved") {
    throw new AppError("INVALID_STATUS", `当前状态为 ${order.status}，无法标记已打款`, 400);
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(withdrawOrders)
      .set({
        status: "paid",
        paidOperatorId: operatorId,
        paidAt: now,
        bankVoucherUrl: bankVoucherUrl ?? order.bankVoucherUrl,
      })
      .where(eq(withdrawOrders.id, withdrawId));

    await tx.insert(auditLogs).values({
      operatorId,
      action: "withdraw_paid",
      targetType: "withdraw_orders",
      targetId: withdrawId,
      before: { status: "approved" },
      after: { status: "paid" },
      ip: null,
      description: `标记提现 #${withdrawId} 已打款，金额 ${order.amount}`,
    });
  });

  return {
    id: withdrawId,
    status: "paid",
  };
}

// ──────────────────────────────────────────────
//  (保留) 旧版审核函数 — 适配新 Status 枚举
//  用于兼容旧版单审流程
// ──────────────────────────────────────────────

export async function reviewWithdraw(
  operatorId: number,
  withdrawId: number,
  action: "approve" | "reject",
  rejectReason?: string | null,
) {
  const db = getDb();

  const [order] = await db
    .select()
    .from(withdrawOrders)
    .where(eq(withdrawOrders.id, withdrawId))
    .limit(1);

  if (!order) {
    throw new AppError("WITHDRAW_NOT_FOUND", "提现订单不存在", 404);
  }

  if (order.status !== "pending_first_review" && order.status !== "pending_second_review") {
    throw new AppError("INVALID_STATUS", `当前状态为 ${order.status}，无法审核`, 400);
  }

  await db.transaction(async (tx) => {
    if (action === "approve") {
      // 审核通过时生成凭证号并计算实际金额
      const voucherNo = await generateVoucherNo('B');
      const orderAmount = num(order.amount);
      const orderFee = num(order.feeAmount);
      const actualAmount = (orderAmount - orderFee).toFixed(6);

      await tx
        .update(withdrawOrders)
        .set({
          status: "approved",
          reviewedBy: operatorId,
          reviewedAt: new Date(),
          voucherNo,
          actualAmount,
        })
        .where(eq(withdrawOrders.id, withdrawId));

      await tx.insert(auditLogs).values({
        operatorId,
        action: "withdraw_approve",
        targetType: "withdraw_orders",
        targetId: withdrawId,
        before: { status: order.status },
        after: { status: "approved", voucherNo, actualAmount },
        ip: null,
        description: `审核通过提现 #${withdrawId}，金额 ${order.amount}，凭证号 ${voucherNo}`,
      });
    } else {
      await tx
        .update(agents)
        .set({
          pendingWithdraw: sql`${agents.pendingWithdraw} + ${order.amount}`,
        })
        .where(eq(agents.id, order.agentId));

      await tx
        .update(withdrawOrders)
        .set({
          status: "rejected",
          reviewedBy: operatorId,
          reviewedAt: new Date(),
          rejectReason: rejectReason ?? null,
        })
        .where(eq(withdrawOrders.id, withdrawId));

      await tx.insert(auditLogs).values({
        operatorId,
        action: "withdraw_reject",
        targetType: "withdraw_orders",
        targetId: withdrawId,
        before: { status: order.status },
        after: { status: "rejected", rejectReason },
        ip: null,
        description: `审核拒绝提现 #${withdrawId}: ${rejectReason ?? "无原因"}`,
      });
    }
  });

  return {
    id: withdrawId,
    status: action === "approve" ? "approved" : "rejected",
  };
}

// ══════════════════════════════════════════════
//  批量审核
// ══════════════════════════════════════════════

export async function batchReviewWithdraws(
  operatorId: number,
  ids: number[],
  action: "approve" | "reject",
  rejectReason?: string | null,
) {
  const db = getDb();
  let approved = 0;
  let rejected = 0;
  const errors: { id: number; reason: string }[] = [];

  for (const withdrawId of ids) {
    try {
      const result = await firstReviewWithdraw(operatorId, withdrawId, action, rejectReason);
      if (result.status === "pending_second_review") approved++;
      else if (result.status === "rejected") rejected++;
    } catch (err: any) {
      errors.push({ id: withdrawId, reason: err.message || "未知错误" });
    }
  }

  return { approved, rejected, total: ids.length, errors };
}
