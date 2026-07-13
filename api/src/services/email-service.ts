// ============================================================
//  3cloud (3C) — 邮件发送服务
//  基于 nodemailer 的 SMTP 发送
// ============================================================

import nodemailer from "nodemailer";
import { logger } from "../logger.js";
import { config } from "../config.js";
import { getDb } from "../db/index.js";
import { emailTemplates, systemConfigs } from "../db/schema.js";
import { eq } from "drizzle-orm";

// ── 传输器（延迟初始化，支持 system_configs 后备） ──

let transporter: nodemailer.Transporter | null = null;
let transporterInitAttempted = false;

async function getTransporter(): Promise<nodemailer.Transporter | null> {
  if (transporter) return transporter;
  if (transporterInitAttempted) return null; // 只尝试一次

  transporterInitAttempted = true;

  const { smtp } = config;

  // 组装 SMTP 配置：优先环境变量，其次 system_configs
  let smtpHost = smtp.host && smtp.host !== "localhost" ? smtp.host : "";
  let smtpPort = smtp.port;
  let smtpSecure = smtp.secure;
  let smtpUser = smtp.user;
  let smtpPass = smtp.pass;

  // 环境变量未配置时，尝试从 system_configs 表读取
  if (!smtpHost) {
    try {
      const db = getDb();

      const [hostRow] = await db
        .select({ value: systemConfigs.value })
        .from(systemConfigs)
        .where(eq(systemConfigs.key, "smtp_host"))
        .limit(1);
      const [portRow] = await db
        .select({ value: systemConfigs.value })
        .from(systemConfigs)
        .where(eq(systemConfigs.key, "smtp_port"))
        .limit(1);
      const [userRow] = await db
        .select({ value: systemConfigs.value })
        .from(systemConfigs)
        .where(eq(systemConfigs.key, "smtp_user"))
        .limit(1);
      const [passRow] = await db
        .select({ value: systemConfigs.value })
        .from(systemConfigs)
        .where(eq(systemConfigs.key, "smtp_pass"))
        .limit(1);

      if (hostRow?.value) {
        smtpHost = hostRow.value;
      }
      if (portRow?.value) {
        smtpPort = parseInt(portRow.value, 10) || 587;
      }
      if (userRow?.value) {
        smtpUser = userRow.value;
      }
      if (passRow?.value) {
        smtpPass = passRow.value;
      }
    } catch {
      // system_configs 表可能尚不存在（首次部署），静默忽略
    }
  }

  if (!smtpHost) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure || smtpPort === 465,
    auth: smtpUser
      ? { user: smtpUser, pass: smtpPass }
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

export async function loadTemplate(name: string): Promise<EmailTemplate | null> {
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

export function renderTemplate(
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
  const t = await getTransporter();
  if (!t) {
    // 开发环境：打印日志
    logger.info({ to: params.to, subject: params.subject, bodyLength: params.html.length }, "[Email] (dev) 邮件已记录");
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
    logger.error({ err, to: params.to }, "[Email] 发送失败");
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
    logger.warn({ template: "real_name_result" }, "[Email] 未找到实名结果邮件模板");
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
    logger.warn({ template: "login_alert" }, "[Email] 未找到登录提醒模板");
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
    logger.warn({ template: "account_banned" }, "[Email] 未找到账号封禁模板");
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
