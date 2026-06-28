// ============================================================
//  3cloud (3C) — 邮件发送服务
//  基于 nodemailer 的 SMTP 发送
// ============================================================

import nodemailer from "nodemailer";
import { config } from "../config.js";
import { getDb } from "../db/index.js";
import { emailTemplates } from "../db/schema.js";
import { eq } from "drizzle-orm";

// ── 传输器（延迟初始化） ──

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  const { smtp } = config;
  if (!smtp.host || smtp.host === "localhost") {
    // 开发环境：跳过真实发送
    return null;
  }

  transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user
      ? { user: smtp.user, pass: smtp.pass }
      : undefined,
  });

  return transporter;
}

// ── 加载邮件模板 ──

interface EmailTemplate {
  subjectZh: string;
  subjectEn: string;
  bodyHtmlZh: string;
  bodyHtmlEn: string;
}

const templateCache = new Map<string, EmailTemplate>();
let templateCacheTime = 0;
const CACHE_TTL = 60_000; // 1 分钟

async function loadTemplate(name: string): Promise<EmailTemplate | null> {
  const now = Date.now();
  if (now - templateCacheTime > CACHE_TTL) {
    templateCache.clear();
    templateCacheTime = now;
  }

  if (templateCache.has(name)) {
    return templateCache.get(name)!;
  }

  try {
    const db = getDb();
    const [tmpl] = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.name, name))
      .limit(1);

    if (!tmpl) return null;

    const result: EmailTemplate = {
      subjectZh: tmpl.subjectZh,
      subjectEn: tmpl.subjectEn,
      bodyHtmlZh: tmpl.bodyHtmlZh,
      bodyHtmlEn: tmpl.bodyHtmlEn,
    };
    templateCache.set(name, result);
    return result;
  } catch {
    return null;
  }
}

// ── 模板渲染（简单变量替换） ──

function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

// ── 发送邮件 ──

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    // 开发环境：打印日志
    console.log(`[Email] (dev) 邮件已记录:\n  To: ${params.to}\n  Subject: ${params.subject}\n  Body length: ${params.html.length}`);
    return true;
  }

  try {
    await t.sendMail({
      from: config.smtp.from || "noreply@unmisa.com",
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    return true;
  } catch (err) {
    console.error(`[Email] 发送失败 (to=${params.to}):`, err);
    return false;
  }
}

// ── 发送实名结果通知 ──

export interface RealNameResultNotifParams {
  toEmail: string;
  nickname: string | null;
  realName: string;
  isApproved: boolean;
  rejectReason?: string | null;
  userType: "personal" | "enterprise";
}

export async function sendRealNameResultEmail(
  params: RealNameResultNotifParams,
): Promise<boolean> {
  const template = await loadTemplate("real_name_result");
  if (!template) {
    console.warn(`[Email] 未找到实名结果邮件模板 "real_name_result"`);
    return false;
  }

  const vars: Record<string, string> = {
    nickname: params.nickname || params.realName,
    realName: params.realName,
    userType: params.userType === "enterprise" ? "企业用户" : "个人用户",
    status: params.isApproved ? "已通过" : "未通过",
    extraInfo: params.isApproved
      ? "您现在可以正常使用全部 API 功能。"
      : `未通过原因：${params.rejectReason || "信息不完整或不准确"}`,
    rejectReason: params.rejectReason || "",
  };

  const lang = "zh"; // 可根据用户偏好扩展
  const subject = lang === "zh"
    ? renderTemplate(template.subjectZh, vars)
    : renderTemplate(template.subjectEn, vars);
  const bodyHtml = lang === "zh"
    ? renderTemplate(template.bodyHtmlZh, vars)
    : renderTemplate(template.bodyHtmlEn, vars);

  return sendEmail({
    to: params.toEmail,
    subject,
    html: bodyHtml,
  });
}

// ── 发送异地登录提醒 ──

export interface LoginAlertEmailParams {
  toEmail: string;
  nickname: string | null;
  city: string;
  country: string;
  ip: string;
  device: string;
}

export async function sendLoginAlertEmail(
  params: LoginAlertEmailParams,
): Promise<boolean> {
  const template = await loadTemplate("login_alert");
  if (!template) {
    console.warn(`[Email] 未找到登录提醒模板 "login_alert"`);
    return false;
  }

  const now = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  const vars: Record<string, string> = {
    nickname: params.nickname || "用户",
    time: now,
    city: params.city || "未知",
    country: params.country ? `, ${params.country}` : "",
    ip: params.ip,
    device: params.device || "未知设备",
  };

  const lang = "zh";
  const subject = lang === "zh"
    ? renderTemplate(template.subjectZh, vars)
    : renderTemplate(template.subjectEn, vars);
  const bodyHtml = lang === "zh"
    ? renderTemplate(template.bodyHtmlZh, vars)
    : renderTemplate(template.bodyHtmlEn, vars);

  return sendEmail({ to: params.toEmail, subject, html: bodyHtml });
}

// ── 发送账号封禁通知 ──

export interface AccountBannedEmailParams {
  toEmail: string;
  nickname: string | null;
  reason: string;
  duration: string;
  unbanAt: string;
}

export async function sendAccountBannedEmail(
  params: AccountBannedEmailParams,
): Promise<boolean> {
  const template = await loadTemplate("account_banned");
  if (!template) {
    console.warn(`[Email] 未找到账号封禁模板 "account_banned"`);
    return false;
  }

  const vars: Record<string, string> = {
    nickname: params.nickname || "用户",
    reason: params.reason,
    duration: params.duration,
    unbanAt: params.unbanAt,
  };

  const lang = "zh";
  const subject = lang === "zh"
    ? renderTemplate(template.subjectZh, vars)
    : renderTemplate(template.subjectEn, vars);
  const bodyHtml = lang === "zh"
    ? renderTemplate(template.bodyHtmlZh, vars)
    : renderTemplate(template.bodyHtmlEn, vars);

  return sendEmail({ to: params.toEmail, subject, html: bodyHtml });
}
