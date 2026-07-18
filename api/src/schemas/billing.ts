// ============================================================
//  3cloud (3C) — Billing / Recharge Zod Schemas
// ============================================================

import { z } from "zod";

export const rechargeSchema = z.object({
  amount: z.string().min(1), // DECIMAL(18,6) as string
  channel: z.enum(["wechat_scan", "wechat_jsapi", "alipay_scan", "alipay_jsapi"]),
});
export type RechargeInput = z.infer<typeof rechargeSchema>;
export const rechargeResponse = z.object({
  orderNo: z.string(),
  payUrl: z.string().optional(),   // PC 扫码链接
  payParams: z.any().optional(),   // JSAPI 调起参数
});

export const bankTransferSchema = z.object({
  amount: z.string().min(1),
  bankName: z.string().min(1, "开户银行不能为空").max(255),
  accountNumber: z.string().min(1, "银行账号不能为空").max(100),
  transferDate: z.string().min(1, "转账日期不能为空"),  // YYYY-MM-DD
  remark: z.string().max(500).optional(),
});
export type BankTransferInput = z.infer<typeof bankTransferSchema>;
