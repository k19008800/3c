import nodemailer from "nodemailer";
import { pool } from "../db/index";

/**
 * SMTP 邮件发送服务
 * 封装 nodemailer，env 配置(见 .env)：
 *   SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS / SMTP_FROM
 * 未配置 → SMTP 未启用，sendEmail 返回 {ok:false, message:"SMTP 未配置"}
 * 发送前渲染模板({{var}} 替换)，发送后写 email_logs 发送日志
 */

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

function getConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;
  return {
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true" || process.env.SMTP_PORT === "465",
    user: process.env.SMTP_USER ?? undefined,
    pass: process.env.SMTP_PASS ?? undefined,
    from: process.env.SMTP_FROM ?? `3Cloud <${process.env.SMTP_USER ?? "no-reply@3cloud.io"}>`,
  };
}

function createTransport() {
  const cfg = getConfig();
  if (!cfg) return null;
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
}

/** 展开 {{var}} 变量 */
export function renderTemplate(text: string, vars: Record<string, string | number>): string {
  let out = text;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(String(v));
  }
  // 剩余未命中的变量保留原样（避免误删）
  return out;
}

/** SMTP 是否已配置 */
export function smtpEnabled(): boolean {
  return !!getConfig();
}

/** 发送邮件并记录日志 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  templateName?: string;
  vars?: Record<string, string | number>;
  senderId?: number | null;
}): Promise<{ ok: boolean; message: string; messageId?: string }> {
  const cfg = getConfig();
  if (!cfg) return { ok: false, message: "SMTP 未配置，跳过发送" };

  const subject = opts.templateName && opts.vars ? renderTemplate(opts.subject, opts.vars) : opts.subject;
  const html = opts.templateName && opts.vars && opts.html ? renderTemplate(opts.html, opts.vars) : opts.html;

  const transport = createTransport()!;
  try {
    const info = await transport.sendMail({
      from: cfg.from,
      to: opts.to,
      subject,
      html,
      text: opts.text ?? undefined,
    });
    // 写发送日志
    try {
      await pool.query(
        `INSERT INTO email_logs (to_address, subject, template_name, vars, status, message_id, created_by)
         VALUES ($1,$2,$3,$4,'sent',$5,$6)`,
        [opts.to, subject, opts.templateName ?? null, opts.vars ? JSON.stringify(opts.vars) : null, String(info.messageId ?? ""), opts.senderId ?? null],
      );
    } catch { /* 日志失败不影响发送结果 */ }
    return { ok: true, message: "邮件已发送", messageId: info.messageId };
  } catch (e: any) {
    try {
      await pool.query(
        `INSERT INTO email_logs (to_address, subject, template_name, vars, status, error, created_by)
         VALUES ($1,$2,$3,$4,'failed',$5,$6)`,
        [opts.to, subject, opts.templateName ?? null, opts.vars ? JSON.stringify(opts.vars) : null, String(e?.message ?? "unknown"), opts.senderId ?? null],
      );
    } catch { /* ignore */ }
    return { ok: false, message: `发送失败: ${e?.message ?? "unknown"}` };
  }
}
