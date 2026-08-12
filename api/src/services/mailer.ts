/**
 * SMTP 邮件发送服务
 *
 * 读取 system_config 中的 smtp_* 配置，用 nodemailer 发送邮件，
 * 每次发送写入 email_logs（成功/失败均可追溯）。
 */

import nodemailer from 'nodemailer';
import { db, schema } from '../db';
import { inArray, eq } from 'drizzle-orm';

export interface SmtpConfig {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

const SMTP_KEYS = ['smtp_enabled', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from'] as const;

export async function getSmtpConfig(): Promise<SmtpConfig> {
  const rows = await db.select({ key: schema.systemConfig.key, value: schema.systemConfig.value })
    .from(schema.systemConfig)
    .where(inArray(schema.systemConfig.key, [...SMTP_KEYS]));
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    enabled: map.get('smtp_enabled') === 'true',
    host: map.get('smtp_host') || '',
    port: Number(map.get('smtp_port') || 465),
    user: map.get('smtp_user') || '',
    pass: map.get('smtp_pass') || '',
    from: map.get('smtp_from') || 'no-reply@3cloud.local',
  };
}

/**
 * 发送邮件（记录到 email_logs）。
 * 未配置 SMTP 时返回 { ok: false, skipped: true }，不抛错。
 */
export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  templateName?: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const cfg = await getSmtpConfig();

  // 先落一条日志（pending），后续更新状态
  const [logRow] = await db.insert(schema.emailLogs).values({
    toAddress: opts.to,
    subject: opts.subject,
    templateName: opts.templateName ?? null,
    content: opts.html,
    status: 'pending',
  }).returning();
  if (!logRow) throw new Error('email_logs insert failed');

  if (!cfg.enabled || !cfg.host) {
    await db.update(schema.emailLogs)
      .set({ status: 'skipped', error: 'SMTP 未配置' })
      .where(eq(schema.emailLogs.id, logRow.id));
    return { ok: false, skipped: true };
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });

  try {
    await transporter.sendMail({
      from: cfg.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    await db.update(schema.emailLogs)
      .set({ status: 'sent' })
      .where(eq(schema.emailLogs.id, logRow.id));
    return { ok: true };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.update(schema.emailLogs)
      .set({ status: 'failed', error: msg })
      .where(eq(schema.emailLogs.id, logRow.id));
    return { ok: false, error: msg };
  }
}
