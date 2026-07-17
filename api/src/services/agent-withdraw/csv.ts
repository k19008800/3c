// ============================================================
//  3cloud (3C) — 提现 CSV 导出
// ============================================================

import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  users,
  agents,
  withdrawOrders,
} from "../../db/schema.js";

// ══════════════════════════════════════════════
//  Admin: Withdraw — CSV 导出
// ══════════════════════════════════════════════

export async function exportWithdrawsCsv(status?: string): Promise<string> {
  const db = getDb();

  const conditions = [sql`1=1`];
  if (status) {
    conditions.push(eq(withdrawOrders.status, status as any));
  }

  const rows = await db
    .select({
      id: withdrawOrders.id,
      agentId: withdrawOrders.agentId,
      email: users.email,
      nickname: users.nickname,
      voucherNo: withdrawOrders.voucherNo,
      amount: withdrawOrders.amount,
      feeAmount: withdrawOrders.feeAmount,
      actualAmount: withdrawOrders.actualAmount,
      bankCardNo: withdrawOrders.bankCardNo,
      bankName: withdrawOrders.bankName,
      status: withdrawOrders.status,
      rejectReason: withdrawOrders.rejectReason,
      createdAt: withdrawOrders.createdAt,
      paidAt: withdrawOrders.paidAt,
    })
    .from(withdrawOrders)
    .innerJoin(agents, eq(withdrawOrders.agentId, agents.id))
    .innerJoin(users, eq(agents.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(withdrawOrders.createdAt));

  const STATUS_LABEL: Record<string, string> = {
    pending_first_review: "待初审",
    pending_second_review: "待复审",
    approved: "已通过",
    paid: "已打款",
    rejected: "已拒绝",
  };

  const lines: string[] = [];
  lines.push('"3cloud 提现导出"');
  lines.push(`"导出时间","${new Date().toISOString()}"`);
  if (status) {
    lines.push(`"筛选状态","${STATUS_LABEL[status] || status}"`);
  }
  lines.push('');
  lines.push('"ID","凭证号","代理商ID","代理商昵称","邮箱","金额","手续费","实际到账","银行卡号","开户行","状态","拒绝原因","创建时间","打款时间"');

  for (const r of rows) {
    const escape = (v: string | null | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`;
    lines.push([
      r.id,
      escape(r.voucherNo),
      r.agentId,
      escape(r.nickname),
      escape(r.email),
      r.amount,
      r.feeAmount ?? "0.000000",
      r.actualAmount ?? r.amount,
      escape(r.bankCardNo),
      escape(r.bankName),
      STATUS_LABEL[r.status] || r.status,
      escape(r.rejectReason),
      r.createdAt.toISOString(),
      r.paidAt?.toISOString() ?? "",
    ].join(","));
  }

  return lines.join("\n");
}
