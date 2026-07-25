// ============================================================
//  3cloud (3C) — 提现 CSV 导出（流式优化）
// ============================================================

import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  users,
  agents,
  withdrawOrders,
} from "../../db/schema.js";
import type { FastifyReply } from "fastify";

// ══════════════════════════════════════════════
//  Admin: Withdraw — CSV 导出（流式版本）
// ══════════════════════════════════════════════

const STATUS_LABEL: Record<string, string> = {
  pending_first_review: "待初审",
  pending_second_review: "待复审",
  approved: "已通过",
  paid: "已打款",
  rejected: "已拒绝",
};

/**
 * 流式导出提现记录
 */
export async function streamExportWithdrawsCsv(
  reply: FastifyReply,
  status?: string,
  maxRows: number = 10000,
  batchSize: number = 1000
): Promise<void> {
  const db = getDb();

  const conditions = [sql`1=1`];
  if (status) {
    conditions.push(eq(withdrawOrders.status, status as any));
  }

  // 设置响应头
  reply.raw.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="withdraws_export_${Date.now()}.csv"`,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  // 设置5分钟超时
  reply.raw.setTimeout(300000, () => {
    reply.raw.destroy();
  });

  // 写入BOM和标题
  reply.raw.write('\uFEFF');
  reply.raw.write('"3cloud 提现导出"\n');
  reply.raw.write(`"导出时间","${new Date().toISOString()}"\n`);
  if (status) {
    reply.raw.write(`"筛选状态","${STATUS_LABEL[status] || status}"\n`);
  }
  reply.raw.write('\n');
  reply.raw.write('"ID","凭证号","代理商ID","代理商昵称","邮箱","金额","手续费","实际到账","银行卡号","开户行","状态","拒绝原因","创建时间","打款时间"\n');

  let offset = 0;
  let totalRows = 0;

  try {
    while (totalRows < maxRows) {
      const limit = Math.min(batchSize, maxRows - totalRows);
      const batch = await db
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
        .orderBy(desc(withdrawOrders.createdAt))
        .limit(limit)
        .offset(offset);

      if (batch.length === 0) {
        break; // 没有更多数据
      }

      // 写入批次数据
      for (const r of batch) {
        const escape = (v: string | null | undefined) => {
          const str = (v ?? "").replace(/"/g, '""');
          return `"${str}"`;
        };
        
        const line = [
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
        ].join(",") + "\n";
        
        reply.raw.write(line);
      }

      totalRows += batch.length;
      offset += batch.length;

      // 如果批次不满，说明已到末尾
      if (batch.length < batchSize) {
        break;
      }

      // 每批次后立即刷新，避免缓冲区堆积
      await new Promise(resolve => {
        const raw = reply.raw as any;
        if (raw.flush) {
          raw.flush(() => resolve(undefined));
        } else {
          resolve(undefined);
        }
      });
    }

    // 导出完成
    reply.raw.end();
    
    console.log(`[StreamExportWithdraws] 导出 ${totalRows} 行提现数据`);
    
  } catch (error) {
    console.error('[StreamExportWithdraws] 导出失败:', error);
    
    // 尝试发送错误信息
    try {
      if (!reply.raw.headersSent) {
        reply.status(500).send({
          code: 500,
          data: null,
          message: '提现导出过程中发生错误'
        });
      } else {
        reply.raw.destroy();
      }
    } catch {
      // 忽略响应发送失败的错误
    }
    throw error;
  }
}

/**
 * 兼容旧版接口：一次性导出（已废弃，建议使用流式版本）
 * @deprecated 请使用 streamExportWithdrawsCsv
 */
export async function exportWithdrawsCsv(status?: string): Promise<string> {
  // 保留旧接口兼容性，但日志警告
  console.warn('[DEPRECATED] exportWithdrawsCsv 已废弃，请使用流式版本 streamExportWithdrawsCsv');
  
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
    .orderBy(desc(withdrawOrders.createdAt))
    .limit(10000); // 添加限制防止内存溢出

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
