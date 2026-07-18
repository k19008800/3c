// ============================================================
//  3cloud (3C) — Auth / User Zod Schemas
// ============================================================

import { z } from "zod";

// ── 密码强度 ──

const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

// ── 注册 ──

export const registerSchema = z.object({
  email: z.string().email("邮箱格式不正确"),
  password: z.string().min(8, "密码至少 8 位").regex(PASSWORD_REGEX, "密码必须至少 8 位，且包含大小写字母、数字和特殊字符"),
  confirmPassword: z.string().min(8),
  refCode: z.string().optional(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "两次密码不一致",
  path: ["confirmPassword"],
});
export type RegisterInput = z.infer<typeof registerSchema>;
export const registerResponse = z.object({
  message: z.string(),
});

// ── 登录 ──

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const loginWithCaptchaSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  captcha: z.string().min(1, "验证码不能为空"),
  captchaSession: z.string().min(1),
});
export type LoginWithCaptchaInput = z.infer<typeof loginWithCaptchaSchema>;
export const loginResponse = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
});

// ── Refresh Token ──

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshSchema>;
export const refreshResponse = z.object({
  accessToken: z.string(),
  expiresIn: z.number(),
});

// ── 用户资料 ──

export const updateProfileSchema = z.object({
  nickname: z.string().max(100).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8).regex(PASSWORD_REGEX, "密码必须至少 8 位，且包含大小写字母、数字和特殊字符"),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ── 实名认证 ──

export const realNamePersonalSchema = z.object({
  realName: z.string().min(1).max(100),
  idNumber: z.string().regex(/^\d{17}[\dXx]$/, "身份证号格式不正确"),
  idFrontImage: z.string().max(500).optional(),
  idBackImage: z.string().max(500).optional(),
});
export type RealNamePersonalInput = z.infer<typeof realNamePersonalSchema>;

export const realNameEnterpriseSchema = z.object({
  realName: z.string().min(1).max(100),
  idNumber: z.string().regex(/^\d{17}[\dXx]$/, "身份证号格式不正确"),
  companyName: z.string().min(1).max(255),
  companyRegNumber: z.string().min(1).max(50),
  idFrontImage: z.string().max(500).optional(),
  idBackImage: z.string().max(500).optional(),
  businessLicense: z.string().max(500).optional(),
  bankName: z.string().max(255).optional(),
  bankAccount: z.string().max(100).optional(),
  bankAddress: z.string().max(500).optional(),
  invoiceTitle: z.string().max(255).optional(),
  invoiceTaxId: z.string().max(50).optional(),
});
export type RealNameEnterpriseInput = z.infer<typeof realNameEnterpriseSchema>;

export const realNameUploadSchema = z.object({
  fileType: z.enum(["id_front", "id_back", "business_license"]),
});
export type RealNameUploadInput = z.infer<typeof realNameUploadSchema>;

export const realNameUploadResponse = z.object({
  relativePath: z.string(),
});

export const realNameStatusResponse = z.object({
  status: z.enum(["unverified", "pending_review", "approved", "rejected"]),
  userType: z.enum(["personal", "enterprise"]),
  realName: z.string().nullable(),
  idNumber: z.string().nullable(),
  idFrontImage: z.string().nullable(),
  idBackImage: z.string().nullable(),
  companyName: z.string().nullable(),
  companyRegNumber: z.string().nullable(),
  businessLicense: z.string().nullable(),
  rejectReason: z.string().nullable(),
  reviewVersion: z.number().nullable(),
});

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

// ── 密码重置 ──

export const resetPasswordSchema = z.object({
  email: z.string().email(),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const resetPasswordConfirmSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).regex(PASSWORD_REGEX, "密码必须至少 8 位，且包含大小写字母、数字和特殊字符"),
  confirmPassword: z.string().min(8),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "两次密码不一致",
  path: ["confirmPassword"],
});
export type ResetPasswordConfirmInput = z.infer<typeof resetPasswordConfirmSchema>;
