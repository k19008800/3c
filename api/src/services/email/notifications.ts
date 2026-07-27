// ============================================================
//  3cloud (3C) — 邮件发送服务 — 通知类邮件
// ============================================================

import { logger } from "../../logger.js";
import { loadTemplate, renderTemplate } from "./template.js";
import { sendEmail, type SendEmailParams } from "./sender.js";

// ── 实名结果通知 ──

export interface RealNameResultNotifParams {
  toEmail: string;
  nickname: string | null;
  realName: string;
  isApproved: boolean;
  rejectReason?: string | null;
  userType: "personal" | "enterprise";
}

export async function sendRealNameResultEmail(params: RealNameResultNotifParams): Promise<boolean> {
  const template = await loadTemplate("real_name_result");
  if (!template) { logger.warn({ template: "real_name_result" }, "[Email] 未找到实名结果模板"); return false; }
  const vars: Record<string, string> = {
    nickname: params.nickname || params.realName, realName: params.realName,
    userType: params.userType === "enterprise" ? "企业用户" : "个人用户",
    status: params.isApproved ? "已通过" : "未通过",
    extraInfo: params.isApproved ? "您现在可以正常使用全部 API 功能。" : `未通过原因：${params.rejectReason || "信息不完整或不准确"}`,
    rejectReason: params.rejectReason || "",
  };
  return sendEmail({ to: params.toEmail, subject: renderTemplate(template.subjectZh, vars), html: renderTemplate(template.bodyHtmlZh, vars) });
}

// ── 异地登录提醒 ──

export interface LoginAlertEmailParams {
  toEmail: string;
  nickname: string | null;
  city: string;
  country: string;
  ip: string;
  device: string;
}

export async function sendLoginAlertEmail(params: LoginAlertEmailParams): Promise<boolean> {
  const template = await loadTemplate("login_alert");
  if (!template) { logger.warn({ template: "login_alert" }, "[Email] 未找到登录提醒模板"); return false; }
  const now = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  const vars: Record<string, string> = {
    nickname: params.nickname || "用户", time: now, city: params.city || "未知",
    country: params.country ? `, ${params.country}` : "", ip: params.ip, device: params.device || "未知设备",
  };
  return sendEmail({ to: params.toEmail, subject: renderTemplate(template.subjectZh, vars), html: renderTemplate(template.bodyHtmlZh, vars) });
}

// ── 账号封禁通知 ──

export interface AccountBannedEmailParams {
  toEmail: string;
  nickname: string | null;
  reason: string;
  duration: string;
  unbanAt: string;
}

export async function sendAccountBannedEmail(params: AccountBannedEmailParams): Promise<boolean> {
  const template = await loadTemplate("account_banned");
  if (!template) { logger.warn({ template: "account_banned" }, "[Email] 未找到封禁模板"); return false; }
  const vars: Record<string, string> = { nickname: params.nickname || "用户", reason: params.reason, duration: params.duration, unbanAt: params.unbanAt };
  return sendEmail({ to: params.toEmail, subject: renderTemplate(template.subjectZh, vars), html: renderTemplate(template.bodyHtmlZh, vars) });
}
