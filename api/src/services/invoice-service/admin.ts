// ============================================================
//  3cloud (3C) — 发票服务 管理员操作
// ============================================================

import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { invoiceRequests } from "../../db/schema.js";
import { AppError } from "../auth-service/index.js";

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
