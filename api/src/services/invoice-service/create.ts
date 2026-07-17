// ============================================================
//  3cloud (3C) — 发票服务 创建开票申请
// ============================================================

import { getDb } from "../../db/index.js";
import { invoiceRequests } from "../../db/schema.js";
import { AppError } from "../auth-service/index.js";
import { getUserRechargeTotal } from "./queries.js";
import type { BankInfo } from "./types.js";

/**
 * 创建开票申请
 */
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
