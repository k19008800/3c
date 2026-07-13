// ============================================================
//  3cloud (3C) — 发票服务 (Business Logic)
// ============================================================
//
// ── 业务逻辑 ──
//
// 【发票状态机】
//   pending ──审核通过──> approved ──管理员开票──> issued
//      │                      │
//      └──审核拒绝──> rejected (含 rejectReason)
//   rejected: 终态, 不可再操作
//   issued: 终态, 已录入 invoiceNo 和 invoiceFileUrl
//
// 【开票申请 (createInvoiceRequest)】
//   - 金额校验: > 0, <= getUserRechargeTotal(userId) (累计已支付充值总额)
//   - 发票类型: 'normal' (普通发票) / 'special' (增值税专用发票)
//   - 专用发票额外信息: taxId (税号), bankInfo (开户行/账号/公司地址/电话)
//   - 关联订单: refOrderId 可选
//   - 状态: 初始 'pending'
//
// 【累计充值额查询 (getUserRechargeTotal)】
//   - 来源: rechargeOrders WHERE userId AND status IN ('paid', 'confirmed')
//   - 聚合: COALESCE(SUM(amount), 0)
//
// 【用户发票列表 (getUserInvoices)】
//   - 分页 + 状态筛选
//   - 返回: 金额, 发票类型, 抬头, 状态, 拒绝原因, 发票号, 文件URL, 快递信息, 各时间节点
//
// 【发票详情 (getInvoiceDetail)】
//   - 可选 userId 参数: 传则增加用户过滤 (用户只能看自己的)
//   - 不传 userId → 管理员视角 (无用户限制)
//
// 【管理员审核】
//   - approveInvoice: status pending → approved, 记录 reviewerId + reviewedAt
//   - rejectInvoice: status pending → rejected, 必须提供 rejectReason (非空验证)
//   - 状态保护: 非 pending 不可操作
//
// 【管理员开票 (issueInvoice)】
//   - 前置: status='approved' (仅已审核通过可开票)
//   - 必需: invoiceNo (发票号码, 非空验证)
//   - 可选: fileUrl (发票文件 URL)
//   - 更新: status='issued', invoiceNo, invoiceFileUrl, issuedAt, issuedBy
//
// 【CSV 导出 (exportInvoicesCsv)】
//   - BOM 前缀: ﻿ (兼容 Excel 中文)
//   - 筛选: status, startDate, endDate
//   - 列: ID, 用户ID, 金额, 发票类型, 发票抬头, 税号, 状态, 发票号码, 快递公司, 快递单号, 创建时间, 审核时间, 开票时间
//
// 【管理员列表 (listAllInvoiceRequests)】
//   - 筛选: status, userId
//   - 分页, createdAt DESC
//
// 【集成点】
//   - rechargeOrders: 累计充值额作为开票上限
//   - auth-service.ts: AppError 统一错误处理

import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { rechargeOrders, invoiceRequests } from "../db/schema.js";
import { AppError } from "./auth-service.js";

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
//  创建开票申请
// ──────────────────────────────────────────────

export interface BankInfo {
  bankName?: string;
  bankAccount?: string;
  companyAddress?: string;
  companyPhone?: string;
}

export async function createInvoiceRequest(
  userId: number,
  amount: string,
  invoiceType: "normal" | "special",
  invoiceTitle: string,
  taxId?: string,
  bankInfo?: BankInfo,
  refOrderId?: number,
) {
  const db = getDb();
  const amountNum = parseFloat(amount);

  if (isNaN(amountNum) || amountNum <= 0) {
    throw new AppError("INVALID_AMOUNT", "开票金额必须大于 0", 400);
  }

  // 校验金额不超过累计充值额
  const rechargeTotal = await getUserRechargeTotal(userId);
  if (amountNum > rechargeTotal) {
    throw new AppError("AMOUNT_EXCEEDS_RECHARGE", `开票金额不能超过累计充值额 ${rechargeTotal.toFixed(6)} 元`, 400);
  }

  // 校验开票类型
  if (!["normal", "special"].includes(invoiceType)) {
    throw new AppError("INVALID_INVOICE_TYPE", "开票类型必须为 normal 或 special", 400);
  }

  const [record] = await db
    .insert(invoiceRequests)
    .values({
      userId,
      amount: amountNum.toFixed(6),
      invoiceType,
      invoiceTitle,
      invoiceTaxId: taxId ?? null,
      bankName: bankInfo?.bankName ?? null,
      bankAccount: bankInfo?.bankAccount ?? null,
      companyAddress: bankInfo?.companyAddress ?? null,
      companyPhone: bankInfo?.companyPhone ?? null,
      refOrderId: refOrderId ?? null,
      status: "pending",
    })
    .returning();

  return record;
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
//  管理员审核通过
// ──────────────────────────────────────────────

export async function approveInvoice(invoiceId: number, reviewerId: number) {
  const db = getDb();

  const [record] = await db
    .select()
    .from(invoiceRequests)
    .where(eq(invoiceRequests.id, invoiceId))
    .limit(1);

  if (!record) {
    throw new AppError("INVOICE_NOT_FOUND", "开票申请不存在", 404);
  }

  if (record.status !== "pending") {
    throw new AppError("INVALID_STATUS", `当前状态为 ${record.status}，无法审核通过`, 400);
  }

  const now = new Date();
  const [updated] = await db
    .update(invoiceRequests)
    .set({
      status: "approved",
      reviewerId,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(eq(invoiceRequests.id, invoiceId))
    .returning();

  return updated;
}

// ──────────────────────────────────────────────
//  管理员拒绝
// ──────────────────────────────────────────────

export async function rejectInvoice(invoiceId: number, reviewerId: number, reason: string) {
  const db = getDb();

  const [record] = await db
    .select()
    .from(invoiceRequests)
    .where(eq(invoiceRequests.id, invoiceId))
    .limit(1);

  if (!record) {
    throw new AppError("INVOICE_NOT_FOUND", "开票申请不存在", 404);
  }

  if (record.status !== "pending") {
    throw new AppError("INVALID_STATUS", `当前状态为 ${record.status}，无法拒绝`, 400);
  }

  if (!reason) {
    throw new AppError("REASON_REQUIRED", "拒绝原因不能为空", 400);
  }

  const now = new Date();
  const [updated] = await db
    .update(invoiceRequests)
    .set({
      status: "rejected",
      reviewerId,
      reviewedAt: now,
      rejectReason: reason,
      updatedAt: now,
    })
    .where(eq(invoiceRequests.id, invoiceId))
    .returning();

  return updated;
}

// ──────────────────────────────────────────────
//  标记已开票
// ──────────────────────────────────────────────

export async function issueInvoice(
  invoiceId: number,
  issuedBy: number,
  invoiceNo: string,
  fileUrl?: string,
) {
  const db = getDb();

  const [record] = await db
    .select()
    .from(invoiceRequests)
    .where(eq(invoiceRequests.id, invoiceId))
    .limit(1);

  if (!record) {
    throw new AppError("INVOICE_NOT_FOUND", "开票申请不存在", 404);
  }

  if (record.status !== "approved") {
    throw new AppError("INVALID_STATUS", `当前状态为 ${record.status}，无法开票（仅 approved 状态可开票）`, 400);
  }

  if (!invoiceNo) {
    throw new AppError("INVOICE_NO_REQUIRED", "发票号码不能为空", 400);
  }

  const now = new Date();
  const [updated] = await db
    .update(invoiceRequests)
    .set({
      status: "issued",
      invoiceNo,
      invoiceFileUrl: fileUrl ?? null,
      issuedAt: now,
      issuedBy,
      updatedAt: now,
    })
    .where(eq(invoiceRequests.id, invoiceId))
    .returning();

  return updated;
}

// ──────────────────────────────────────────────
//  导出开票申请 CSV
// ──────────────────────────────────────────────

export interface InvoiceExportFilters {
  status?: string;
  startDate?: string;
  endDate?: string;
}

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
