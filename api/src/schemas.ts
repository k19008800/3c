// ============================================================
//  3cloud (3C) — API Zod Schemas
//  用途：请求参数校验 + 自动生成 Swagger 文档
// ============================================================

import { z } from "zod";

// ──────────────────────────────────────────────
//  Auth
// ──────────────────────────────────────────────

export const registerSchema = z.object({
  email: z.string().email("邮箱格式不正确"),
  password: z.string().min(6, "密码至少 6 位"),
  confirmPassword: z.string().min(6),
}).refine((d) => d.password === d.confirmPassword, {
  message: "两次密码不一致",
  path: ["confirmPassword"],
});
export type RegisterInput = z.infer<typeof registerSchema>;
export const registerResponse = z.object({
  message: z.string(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;
export const loginResponse = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshSchema>;
export const refreshResponse = z.object({
  accessToken: z.string(),
  expiresIn: z.number(),
});

// ──────────────────────────────────────────────
//  User
// ──────────────────────────────────────────────

export const updateProfileSchema = z.object({
  nickname: z.string().max(100).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const realNamePersonalSchema = z.object({
  realName: z.string().min(1).max(100),
  idNumber: z.string().regex(/^\d{17}[\dXx]$/, "身份证号格式不正确"),
});
export type RealNamePersonalInput = z.infer<typeof realNamePersonalSchema>;

export const realNameEnterpriseSchema = z.object({
  companyName: z.string().min(1).max(255),
  companyRegNumber: z.string().min(1).max(50),
  bankName: z.string().max(255).optional(),
  bankAccount: z.string().max(100).optional(),
  bankAddress: z.string().max(500).optional(),
  invoiceTitle: z.string().max(255).optional(),
  invoiceTaxId: z.string().max(50).optional(),
});
export type RealNameEnterpriseInput = z.infer<typeof realNameEnterpriseSchema>;

export const userProfileResponse = z.object({
  id: z.number(),
  email: z.string(),
  nickname: z.string().nullable(),
  userType: z.enum(["personal", "enterprise"]),
  role: z.enum(["super_admin", "admin", "agent", "user"]),
  realNameStatus: z.enum(["unverified", "pending_review", "approved", "rejected"]),
  balance: z.string(),
  createdAt: z.string(),
});

export const resetPasswordSchema = z.object({
  email: z.string().email(),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const resetPasswordConfirmSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(6),
  confirmPassword: z.string().min(6),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "两次密码不一致",
  path: ["confirmPassword"],
});
export type ResetPasswordConfirmInput = z.infer<typeof resetPasswordConfirmSchema>;

// ──────────────────────────────────────────────
//  API Key
// ──────────────────────────────────────────────

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  expiresAt: z.string().datetime().optional(),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export const createApiKeyResponse = z.object({
  id: z.number(),
  name: z.string(),
  key: z.string(), // 原始 Key，仅展示一次
  keyPrefix: z.string(),
  expiresAt: z.string().nullable(),
});

export const updateApiKeySchema = z.object({
  name: z.string().max(100).optional(),
  status: z.boolean().optional(),
});
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;

// ──────────────────────────────────────────────
//  Team
// ──────────────────────────────────────────────

export const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const inviteTeamMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["team_admin", "team_member"]).default("team_member"),
  quotaBalance: z.string().optional(), // DECIMAL(18,6) as string
});
export type InviteTeamMemberInput = z.infer<typeof inviteTeamMemberSchema>;

export const updateTeamMemberSchema = z.object({
  role: z.enum(["team_admin", "team_member", "team_owner"]).optional(),
  quotaBalance: z.string().optional(),
});
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;

// ──────────────────────────────────────────────
//  Billing
// ──────────────────────────────────────────────

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
  bankName: z.string().max(255),
  accountNumber: z.string().max(100),
  transferDate: z.string(),        // YYYY-MM-DD
  remark: z.string().max(500).optional(),
});
export type BankTransferInput = z.infer<typeof bankTransferSchema>;

// ──────────────────────────────────────────────
//  Team Quota
// ──────────────────────────────────────────────

export const setMemberQuotaSchema = z.object({
  memberUserId: z.number(),
  quotaBalance: z.string(),         // DECIMAL(18,6) as string, null=无上限
}).nullable();
export type SetMemberQuotaInput = z.infer<typeof setMemberQuotaSchema>;

// ──────────────────────────────────────────────
//  Admin — User Management
// ──────────────────────────────────────────────

export const adminUpdateUserSchema = z.object({
  nickname: z.string().max(100).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  role: z.enum(["user", "agent", "admin"]).optional(),
  discountRate: z.string().optional(),
  rpmOverride: z.number().int().positive().optional(),
  tpmOverride: z.number().int().positive().optional(),
  realNameStatus: z.enum(["approved", "rejected"]).optional(),
  rejectReason: z.string().max(500).optional(),
});
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

export const adminManualRechargeSchema = z.object({
  userId: z.number(),
  amount: z.string(),
  description: z.string().max(500).optional(),
});
export type AdminManualRechargeInput = z.infer<typeof adminManualRechargeSchema>;

export const adminResetPasswordSchema = z.object({
  userId: z.number(),
  newPassword: z.string().min(6),
});
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;

// ──────────────────────────────────────────────
//  Admin — Model & Vendor
// ──────────────────────────────────────────────

export const createVendorSchema = z.object({
  name: z.string().min(1).max(100),
  baseUrl: z.string().url(),
  description: z.string().max(500).optional(),
});
export type CreateVendorInput = z.infer<typeof createVendorSchema>;

export const updateVendorSchema = z.object({
  baseUrl: z.string().url().optional(),
  description: z.string().max(500).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export const createModelSchema = z.object({
  name: z.string().min(1).max(100),
  displayName: z.string().max(200).optional(),
  type: z.enum(["chat", "embedding", "image", "audio"]),
});
export type CreateModelInput = z.infer<typeof createModelSchema>;

export const createVendorModelSchema = z.object({
  vendorId: z.number(),
  modelId: z.number(),
  upstreamModelName: z.string().min(1).max(200),
  apiEndpoint: z.string().url(),
  apiKey: z.string().min(1),                    // 明文传入，后端加密存储
  costPriceInput: z.string(),
  costPriceOutput: z.string(),
  sellPriceInput: z.string(),
  sellPriceOutput: z.string(),
  weight: z.number().int().positive().default(100),
  rpmLimit: z.number().int().positive().optional(),
  tpmLimit: z.number().int().positive().optional(),
});
export type CreateVendorModelInput = z.infer<typeof createVendorModelSchema>;

export const updateVendorModelSchema = z.object({
  upstreamModelName: z.string().max(200).optional(),
  apiEndpoint: z.string().url().optional(),
  apiKey: z.string().optional(),
  costPriceInput: z.string().optional(),
  costPriceOutput: z.string().optional(),
  sellPriceInput: z.string().optional(),
  sellPriceOutput: z.string().optional(),
  weight: z.number().int().positive().optional(),
  status: z.boolean().optional(),
});
export type UpdateVendorModelInput = z.infer<typeof updateVendorModelSchema>;

// ──────────────────────────────────────────────
//  Admin — Agent
// ──────────────────────────────────────────────

export const createAgentSchema = z.object({
  userId: z.number(),
  commissionRate: z.string(),
});
export type CreateAgentInput = z.infer<typeof createAgentSchema>;

export const updateAgentSchema = z.object({
  commissionRate: z.string().optional(),
  status: z.boolean().optional(),
});

export const reviewWithdrawSchema = z.object({
  action: z.enum(["approve", "reject"]),
  rejectReason: z.string().max(500).optional(),
});
export type ReviewWithdrawInput = z.infer<typeof reviewWithdrawSchema>;

// ──────────────────────────────────────────────
//  Admin — System Config
// ──────────────────────────────────────────────

export const updateConfigSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().min(1),
});
export type UpdateConfigInput = z.infer<typeof updateConfigSchema>;

// ──────────────────────────────────────────────
//  Agent Console
// ──────────────────────────────────────────────

export const agentWithdrawSchema = z.object({
  amount: z.string(),               // ≥ 50 元
});
export type AgentWithdrawInput = z.infer<typeof agentWithdrawSchema>;

// ──────────────────────────────────────────────
//  Pagination (common)
// ──────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const logFilterSchema = paginationSchema.extend({
  modelId: z.coerce.number().optional(),
  vendorName: z.string().optional(),
  status: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// ──────────────────────────────────────────────
//  Admin — Log Filters
// ──────────────────────────────────────────────

export const adminLogFilterSchema = logFilterSchema.extend({
  userId: z.coerce.number().optional(),
});

// ──────────────────────────────────────────────
//  OpenAI Compatible (Token Proxy)
// ──────────────────────────────────────────────

// OpenAI Chat Completions Request (validated subset)
export const chatCompletionSchema = z.object({
  model: z.string().min(1),
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant", "tool"]),
    content: z.union([z.string(), z.array(z.any())]),
  })).min(1),
  stream: z.boolean().optional().default(false),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  top_p: z.number().min(0).max(1).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
});

export type ChatCompletionInput = z.infer<typeof chatCompletionSchema>;

// Embeddings Request
export const embeddingsSchema = z.object({
  model: z.string().min(1),
  input: z.union([z.string(), z.array(z.string())]),
});
export type EmbeddingsInput = z.infer<typeof embeddingsSchema>;

// ──────────────────────────────────────────────
//  Common Response Wrappers
// ──────────────────────────────────────────────

export function successResponse<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    code: z.literal(0),
    data: dataSchema,
    message: z.literal("ok"),
  });
}

export function paginatedResponse<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    code: z.literal(0),
    data: z.object({
      list: z.array(itemSchema),
      total: z.number(),
      page: z.number(),
      pageSize: z.number(),
    }),
    message: z.literal("ok"),
  });
}

export const errorResponse = z.object({
  code: z.number(),
  data: z.null(),
  message: z.string(),
});
