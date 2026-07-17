// ============================================================
//  3cloud (3C) — 发票服务 查询逻辑
// ============================================================

import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { rechargeOrders, invoiceRequests } from "../../db/schema.js";
import { AppError } from "../auth-service/index.js";
import type { InvoiceExportFilters } from "./types.js";

// ──────────────────────────────────────────────
//  查询用户累计已支付充值总额
// ──────────────────────────────────────────────

export async function getUserRechargeTotal(userId: number): Promise<number> {
  const db = getDb();
  const [result] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${rechargeOrders.amount}), '0.000000')`,
    })
    .from(rechargeOrders)
    .where(
      and(
        eq(rechargeOrders.userId, userId),
        sql`${rechargeOrders.status} IN ('paid', 'confirmed')`,
      ),
    );

  return parseFloat(result?.total ?? "0");
}

// ──────────────────────────────────────────────
//  用户查询自己的开票记录
// ──────────────────────────────────────────────

export async function getUserInvoices(
  userId: number,
  page: number = 1,
  pageSize: number = 20,
  status?: string,
) {
  const db = getDb();
  const offset = (page - 1) * pageSize;

  const conditions: any[] = [eq(invoiceRequests.userId, userId)];
  if (status) {
    conditions.push(eq(invoiceRequests.status, status));
  }

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(invoiceRequests)
    .where(and(...conditions));

  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select()
    .from(invoiceRequests)
    .where(and(...conditions))
    .orderBy(desc(invoiceRequests.createdAt))
    .limit(pageSize)
    .offset(offset);

  const list = rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    invoiceType: r.invoiceType,
    invoiceTitle: r.invoiceTitle,
    status: r.status,
    rejectReason: r.rejectReason,
    invoiceNo: r.invoiceNo,
    invoiceFileUrl: r.invoiceFileUrl,
    expressCompany: r.expressCompany,
    expressNo: r.expressNo,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    issuedAt: r.issuedAt?.toISOString() ?? null,
  }));

  return { list, total, page, pageSize };
}

// ──────────────────────────────────────────────
//  开票详情
// ──────────────────────────────────────────────

export async function getInvoiceDetail(invoiceId: number, userId?: number) {
  const db = getDb();

  const conditions: any[] = [eq(invoiceRequests.id, invoiceId)];
  if (userId !== undefined) {
    conditions.push(eq(invoiceRequests.userId, userId));
  }

  const [row] = await db
    .select()
    .from(invoiceRequests)
    .where(and(...conditions))
    .limit(1);

  if (!row) {
    throw new AppError("INVOICE_NOT_FOUND", "开票申请不存在", 404);
  }

  return row;
}

// ──────────────────────────────────────────────
//  管理员查看所有开票申请
// ──────────────────────────────────────────────

export async function listAllInvoiceRequests(
  page: number = 1,
  pageSize: number = 20,
  status?: string,
  userId?: number,
) {
  const db = getDb();
  const offset = (page - 1) * pageSize;

  const conditions: any[] = [sql`1=1`];
  if (status) {
    conditions.push(eq(invoiceRequests.status, status));
  }
  if (userId) {
    conditions.push(eq(invoiceRequests.userId, userId));
  }

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(invoiceRequests)
    .where(and(...conditions));

  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select()
    .from(invoiceRequests)
    .where(and(...conditions))
    .orderBy(desc(invoiceRequests.createdAt))
    .limit(pageSize)
    .offset(offset);

  return { list: rows, total, page, pageSize };
}

// ──────────────────────────────────────────────
//  导出开票申请 CSV
// ──────────────────────────────────────────────

export async function exportInvoicesCsv(filters: InvoiceExportFilters): Promise<string> {
  const db = getDb();

  const conditions: any[] = [sql`1=1`];
  if (filters.status) {
    conditions.push(eq(invoiceRequests.status, filters.status));
  }
  if (filters.startDate) {
    conditions.push(sql`${invoiceRequests.createdAt} >= ${filters.startDate}::timestamptz`);
  }
  if (filters.endDate) {
    conditions.push(sql`${invoiceRequests.createdAt} < ${filters.endDate}::timestamptz + interval '1 day'`);
  }

  const rows = await db
    .select()
    .from(invoiceRequests)
    .where(and(...conditions))
    .orderBy(desc(invoiceRequests.createdAt));

  const header = "ID,用户ID,金额,发票类型,发票抬头,税号,状态,发票号码,快递公司,快递单号,创建时间,审核时间,开票时间\n";
  const lines = rows.map((r) => {
    const cols = [
      r.id,
      r.userId,
      r.amount,
      r.invoiceType,
      r.invoiceTitle,
      r.invoiceTaxId ?? "",
      r.status,
      r.invoiceNo ?? "",
      r.expressCompany ?? "",
      r.expressNo ?? "",
      r.createdAt.toISOString(),
      r.reviewedAt?.toISOString() ?? "",
      r.issuedAt?.toISOString() ?? "",
    ];
    return cols.join(",");
  });

  return "\uFEFF" + header + lines.join("\n");
}
