// ============================================================
//  3cloud (3C) — 代理佣金 CSV 导出
// ============================================================

import { eq, and, sql, desc, gte, lte } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  users,
  commissionLogs,
} from "../../db/schema.js";
import { getAgentByUserId, COMMISSION_TYPE_LABEL } from "../agent-helpers.js";

// ══════════════════════════════════════════════
//  佣金 CSV 导出 (代理商视角)
// ══════════════════════════════════════════════

export async function exportAgentCommissionsCsv(
  userId: number,
  filters?: {
    status?: string;
    commissionType?: string;
    startDate?: string;
    endDate?: string;
  },
): Promise<string> {
  const db = getDb();
  const agent = await getAgentByUserId(userId);

  const conditions: any[] = [eq(commissionLogs.agentId, agent.id)];
  if (filters?.status) {
    conditions.push(eq(commissionLogs.status, filters.status as any));
  }
  if (filters?.commissionType) {
    conditions.push(eq(commissionLogs.commissionType, filters.commissionType));
  }
  if (filters?.startDate) {
    conditions.push(gte(commissionLogs.createdAt, new Date(filters.startDate)));
  }
  if (filters?.endDate) {
    conditions.push(lte(commissionLogs.createdAt, new Date(filters.endDate)));
  }

  const rows = await db
    .select({
      id: commissionLogs.id,
      callCost: commissionLogs.callCost,
      commissionAmount: commissionLogs.commissionAmount,
      commissionType: commissionLogs.commissionType,
      voucherNo: commissionLogs.voucherNo,
      sourceOrderId: commissionLogs.sourceOrderId,
      sourceOrderAmount: commissionLogs.sourceOrderAmount,
      feeRate: commissionLogs.feeRate,
      feeAmount: commissionLogs.feeAmount,
      netAmount: commissionLogs.netAmount,
      status: commissionLogs.status,
      createdAt: commissionLogs.createdAt,
      settledAt: commissionLogs.settledAt,
      customerName: users.nickname,
      customerEmail: users.email,
    })
    .from(commissionLogs)
    .leftJoin(users, eq(commissionLogs.sourceCustomerId, users.id))
    .where(and(...conditions))
    .orderBy(desc(commissionLogs.createdAt));

  const STATUS_LABEL: Record<string, string> = {
    pending: "待结算",
    settled: "已结算",
    cancelled: "已取消",
  };

  const lines: string[] = [];
  lines.push('"3cloud 代理商佣金导出"');
  lines.push(`"导出时间","${new Date().toISOString()}"`);
  if (filters?.status) lines.push(`"筛选状态","${STATUS_LABEL[filters.status] || filters.status}"`);
  if (filters?.startDate) lines.push(`"开始日期","${filters.startDate}"`);
  if (filters?.endDate) lines.push(`"结束日期","${filters.endDate}"`);
  lines.push('');
  lines.push('"ID","客户昵称","客户邮箱","调用成本","佣金金额","手续费","净佣金","类型","状态","凭证号","关联订单","创建时间","结算时间"');

  for (const r of rows) {
    const esc = (v: string | null | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`;
    lines.push([
      r.id,
      esc(r.customerName),
      esc(r.customerEmail),
      r.callCost,
      r.commissionAmount,
      r.feeAmount ?? "0.000000",
      r.netAmount ?? "0.000000",
      COMMISSION_TYPE_LABEL[r.commissionType ?? ""] || r.commissionType || "",
      STATUS_LABEL[r.status] || r.status,
      esc(r.voucherNo),
      esc(r.sourceOrderId),
      r.createdAt.toISOString(),
      r.settledAt?.toISOString() ?? "",
    ].join(","));
  }

  return lines.join("\n");
}
