// ============================================================
//  3cloud (3C) — Agent Zod Schemas (admin + agent console)
// ============================================================

import { z } from "zod";

// ── Admin — Agent Management ──

export const createAgentSchema = z.object({
  userId: z.number(),
  initialSaleRate: z.number().min(0).max(100).optional(),
});
export type CreateAgentInput = z.infer<typeof createAgentSchema>;

export const updateAgentSchema = z.object({
  status: z.boolean().optional(),
});

export const reviewWithdrawSchema = z.object({
  action: z.enum(["approve", "reject"]),
  rejectReason: z.string().max(500).optional(),
});
export type ReviewWithdrawInput = z.infer<typeof reviewWithdrawSchema>;

// 提现双审 schema
export const firstReviewWithdrawSchema = z.object({
  action: z.enum(["approve", "reject"]),
  rejectReason: z.string().max(500).optional(),
});
export type FirstReviewWithdrawInput = z.infer<typeof firstReviewWithdrawSchema>;

export const secondReviewWithdrawSchema = z.object({
  action: z.enum(["approve", "reject"]),
  rejectReason: z.string().max(500).optional(),
  bankVoucherUrl: z.string().optional(), // 复审通过时上传银行回单
});
export type SecondReviewWithdrawInput = z.infer<typeof secondReviewWithdrawSchema>;

export const markWithdrawPaidSchema = z.object({
  bankVoucherUrl: z.string().optional(), // 打款回单
});
export type MarkWithdrawPaidInput = z.infer<typeof markWithdrawPaidSchema>;

// 充值双审 schema
export const firstConfirmRechargeSchema = z.object({
  action: z.enum(["confirm", "reject"]),
  rejectReason: z.string().max(500).optional(),
});
export type FirstConfirmRechargeInput = z.infer<typeof firstConfirmRechargeSchema>;

export const secondConfirmRechargeSchema = z.object({
  action: z.enum(["confirm", "reject"]),
  rejectReason: z.string().max(500).optional(),
  bankTxId: z.string().max(64).optional(),
});
export type SecondConfirmRechargeInput = z.infer<typeof secondConfirmRechargeSchema>;

// 客户消费查询
export const customerConsumptionQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["total_amount", "month_amount", "commission_amount", "last_order_at"]).default("total_amount"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export type CustomerConsumptionQuery = z.infer<typeof customerConsumptionQuerySchema>;

// ── 代理商佣金查询扩展参数 ──

export const agentCommissionQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  commissionType: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  customerSearch: z.string().max(100).optional(),
});
export type AgentCommissionQuery = z.infer<typeof agentCommissionQuerySchema>;

// ── Agent Console ──

export const agentWithdrawSchema = z.object({
  amount: z.union([z.string(), z.number()]).transform((v) => String(v)),  // ≥ 50 元
  bankCardNo: z.string().min(1, "请填写银行卡号").max(64),
  bankName: z.string().min(1, "请填写开户银行").max(128),
});
export type AgentWithdrawInput = z.infer<typeof agentWithdrawSchema>;

export const bindAgentClientSchema = z.object({
  clientUserId: z.number(),
});
export type BindAgentClientInput = z.infer<typeof bindAgentClientSchema>;
