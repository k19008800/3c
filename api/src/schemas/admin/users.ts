// ============================================================
//  3cloud (3C) — Admin User Management Zod Schemas
// ============================================================

import { z } from "zod";

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

export const adminChangeRoleSchema = z.object({
  role: z.enum(["user", "admin", "agent", "super_admin"]),
  reason: z.string().max(500).optional(),
});
export type AdminChangeRoleInput = z.infer<typeof adminChangeRoleSchema>;

export const adminBatchDisableSchema = z.object({
  userIds: z.array(z.number()).min(1).max(100),
  reason: z.string().max(500).optional(),
  disabledUntil: z.string().datetime().optional(), // ISO 时间，不传=永久
});
export type AdminBatchDisableInput = z.infer<typeof adminBatchDisableSchema>;

export const adminBatchEnableSchema = z.object({
  userIds: z.array(z.number()).min(1).max(100),
});
export type AdminBatchEnableInput = z.infer<typeof adminBatchEnableSchema>;

export const adminUnbindOAuthSchema = z.object({
  provider: z.enum(["wechat", "google", "apple", "github"]),
});
export type AdminUnbindOAuthInput = z.infer<typeof adminUnbindOAuthSchema>;

export const adminUpdateApiKeySchema = z.object({
  name: z.string().max(100).optional(),
  status: z.boolean().optional(),
});
export type AdminUpdateApiKeyInput = z.infer<typeof adminUpdateApiKeySchema>;

export const adminExportUsersQuerySchema = z.object({
  status: z.string().optional(),
  userType: z.string().optional(),
  role: z.string().optional(),
  keyword: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type AdminExportUsersQuery = z.infer<typeof adminExportUsersQuerySchema>;

export const adminCreateUserSchema = z.object({
  email: z.string().email("邮箱格式不正确"),
  password: z.string().min(6, "密码至少 6 位"),
  nickname: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  userType: z.enum(["personal", "enterprise"]).default("personal"),
  role: z.enum(["user", "agent", "admin"]).default("user"),
  status: z.enum(["active", "pending"]).default("active"),
  balance: z.string().optional(),                                      // 初始余额
  discountRate: z.string().optional(),
  remark: z.string().max(500).optional(),
});
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;

export const adminAddUserNoteSchema = z.object({
  content: z.string().min(1, "备注内容不能为空").max(2000),
});
export type AdminAddUserNoteInput = z.infer<typeof adminAddUserNoteSchema>;

export const adminUpdateUserNoteSchema = z.object({
  content: z.string().min(1).max(2000),
});
export type AdminUpdateUserNoteInput = z.infer<typeof adminUpdateUserNoteSchema>;

export const adminIpWhitelistSchema = z.object({
  ip: z.string().min(7).max(45).regex(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$|^[0-9a-fA-F:]+$/, "IP 格式不正确"),
  description: z.string().max(255).optional(),
});
export type AdminIpWhitelistInput = z.infer<typeof adminIpWhitelistSchema>;

export const adminUserDataExportSchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
});
export type AdminUserDataExportInput = z.infer<typeof adminUserDataExportSchema>;

export const adminImpersonateSchema = z.object({
  userId: z.number(),
  durationMinutes: z.number().int().min(1).max(60).default(30),
  reason: z.string().max(500).optional(),
});
export type AdminImpersonateInput = z.infer<typeof adminImpersonateSchema>;
