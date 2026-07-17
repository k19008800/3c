// ============================================================
//  3cloud (3C) — 代理提现查询
// ============================================================

import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  users,
  agents,
  withdrawOrders,
} from "../../db/schema.js";
import { getAgentByUserId, getStatusLabel, WITHDRAW_STATUS_LABEL } from "../agent-helpers.js";

// ══════════════════════════════════════════════
//  银行信息预填
// ══════════════════════════════════════════════

export async function getSavedBankInfo(userId: number): Promise<{ bankCardNo: string | null; bankName: string | null } | null> {
  const db = getDb();
  const agent = await getAgentByUserId(userId);

  const [lastPaid] = await db
    .select({
      bankCardNo: withdrawOrders.bankCardNo,
      bankName: withdrawOrders.bankName,
    })
    .from(withdrawOrders)
    .where(
      and(
        eq(withdrawOrders.agentId, agent.id),
        eq(withdrawOrders.status, "paid"),
      ),
    )
    .orderBy(desc(withdrawOrders.createdAt))
    .limit(1);

  if (!lastPaid || !lastPaid.bankCardNo) {
    return null;
  }

  return {
    bankCardNo: lastPaid.bankCardNo,
    bankName: lastPaid.bankName,
  };
}

// ══════════════════════════════════════════════
//  代理商提现列表
// ══════════════════════════════════════════════

export async function getAgentWithdraws(
  userId: number,
  page: number,
  pageSize: number,
  status?: string,
) {
  const db = getDb();
  const agent = await getAgentByUserId(userId);
  const offset = (page - 1) * pageSize;

  const conditions = [eq(withdrawOrders.agentId, agent.id)];
  if (status) {
    conditions.push(eq(withdrawOrders.status, status as any));
  }

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(withdrawOrders)
    .where(and(...conditions));
  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select({
      id: withdrawOrders.id,
      voucherNo: withdrawOrders.voucherNo,
      amount: withdrawOrders.amount,
      feeAmount: withdrawOrders.feeAmount,
      actualAmount: withdrawOrders.actualAmount,
      bankCardNo: withdrawOrders.bankCardNo,
      bankName: withdrawOrders.bankName,
      bankVoucherUrl: withdrawOrders.bankVoucherUrl,
      wechatPayNo: withdrawOrders.wechatPayNo,
      status: withdrawOrders.status,
      auditLevel: withdrawOrders.auditLevel,
      rejectReason: withdrawOrders.rejectReason,
      createdAt: withdrawOrders.createdAt,
      reviewedAt: withdrawOrders.reviewedAt,
      paidAt: withdrawOrders.paidAt,
    })
    .from(withdrawOrders)
    .where(and(...conditions))
    .orderBy(desc(withdrawOrders.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    list: rows.map((r) => ({
      id: r.id,
      voucherNo: r.voucherNo,
      amount: r.amount,
      feeAmount: r.feeAmount ?? "0.000000",
      actualAmount: r.actualAmount ?? r.amount,
      bankCardNo: r.bankCardNo,
      bankName: r.bankName,
      bankVoucherUrl: r.bankVoucherUrl,
      wechatPayNo: r.wechatPayNo,
      status: r.status,
      statusLabel: getStatusLabel(r.status, WITHDRAW_STATUS_LABEL),
      auditLevel: r.auditLevel,
      rejectReason: r.rejectReason,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      paidAt: r.paidAt?.toISOString() ?? null,
    })),
    total,
    page,
    pageSize,
  };
}

// ══════════════════════════════════════════════
//  管理后台提现列表
// ══════════════════════════════════════════════

export async function listAllWithdraws(page: number, pageSize: number, status?: string) {
  const db = getDb();
  const offset = (page - 1) * pageSize;

  const conditions = [sql`1=1`];
  if (status) {
    conditions.push(eq(withdrawOrders.status, status as any));
  }

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(withdrawOrders)
    .innerJoin(agents, eq(withdrawOrders.agentId, agents.id))
    .innerJoin(users, eq(agents.userId, users.id))
    .where(and(...conditions));
  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select({
      id: withdrawOrders.id,
      agentId: withdrawOrders.agentId,
      userId: agents.userId,
      email: users.email,
      nickname: users.nickname,
      voucherNo: withdrawOrders.voucherNo,
      amount: withdrawOrders.amount,
      feeAmount: withdrawOrders.feeAmount,
      actualAmount: withdrawOrders.actualAmount,
      bankCardNo: withdrawOrders.bankCardNo,
      bankName: withdrawOrders.bankName,
      bankVoucherUrl: withdrawOrders.bankVoucherUrl,
      wechatPayNo: withdrawOrders.wechatPayNo,
      status: withdrawOrders.status,
      auditLevel: withdrawOrders.auditLevel,
      rejectReason: withdrawOrders.rejectReason,
      firstAuditorId: withdrawOrders.firstAuditorId,
      firstAuditedAt: withdrawOrders.firstAuditedAt,
      secondAuditorId: withdrawOrders.secondAuditorId,
      secondAuditedAt: withdrawOrders.secondAuditedAt,
      paidOperatorId: withdrawOrders.paidOperatorId,
      riskCheckResult: withdrawOrders.riskCheckResult,
      reviewedBy: withdrawOrders.reviewedBy,
      createdAt: withdrawOrders.createdAt,
      reviewedAt: withdrawOrders.reviewedAt,
      paidAt: withdrawOrders.paidAt,
    })
    .from(withdrawOrders)
    .innerJoin(agents, eq(withdrawOrders.agentId, agents.id))
    .innerJoin(users, eq(agents.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(withdrawOrders.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    list: rows.map((r) => ({
      ...r,
      feeAmount: r.feeAmount ?? "0.000000",
      actualAmount: r.actualAmount ?? r.amount,
      statusLabel: getStatusLabel(r.status, WITHDRAW_STATUS_LABEL),
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      firstAuditedAt: r.firstAuditedAt?.toISOString() ?? null,
      secondAuditedAt: r.secondAuditedAt?.toISOString() ?? null,
      paidAt: r.paidAt?.toISOString() ?? null,
    })),
    total,
    page,
    pageSize,
  };
}
