/**
 * 入账通知服务 — 站内信（必发）+ 按偏好邮件（尽力而为）（P0-4 通知闭环）
 *
 * 裁决（ARCH §6 / 双签 §12 Q3/Q4）：
 * - 站内信写入 `notifications` 表（用户端 /me/notifications 读取），type='recharge_success'；
 *   `user_notifications` 为价格变更专用表（tier NOT NULL + price_change_log_id FK），不写入。
 * - 邮件按 `system_config notification_policies_list` 策略（channel='email' 且
 *   event_type=event；无策略行默认发送；策略行 enabled=false 时跳过）。
 * - 模板取 `email_templates` name='recharge_success'；不存在 → 纯站内信 + email='no_template'
 *   （预留模板名，后台建模板后自动生效，代码零改动）。
 * - 模板渲染：{{变量}} String.replace 简单插值（模板为后台受信内容，不做转义引擎）。
 *
 * 调用约定：必须在主事务 COMMIT 之后调用（通知失败绝不回滚资金）；内部逐通道
 * try/catch，任何失败仅记日志/返回状态，不向外抛错（对齐 admin-consumption.ts
 * notifyHandler 顺序：先站内信后邮件）。
 *
 * @see docs/ARCH-整改R1-R4-技术方案.md §6 R4 入账通知
 * @module services/notify
 */

import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import { sendMail } from './mailer';

/** notifyUser 入参 */
export interface NotifyParams {
  /** 收件用户 ID（站内信必发目标） */
  userId: number;
  /** 通知事件类型（notifications.type），本期统一 'recharge_success' */
  event: string;
  /** 站内信标题 */
  title: string;
  /** 站内信正文（纯文本，用户端 /me/notifications 直接展示） */
  content: string;
  /** 邮件模板名（email_templates.name），如 'recharge_success'；模板缺失 → 纯站内信 */
  templateName?: string;
  /** 模板 {{变量}} 插值（amount / orderNo / balanceAfter 等） */
  templateVars?: Record<string, string | number>;
  /** notifications.metadata（订单号/金额/单证 ID，审计与前端展示用） */
  metadata?: Record<string, unknown>;
}

/** 邮件发送结果状态 */
export type NotifyEmailStatus = 'sent' | 'skipped' | 'failed' | 'no_template';

/**
 * 入账通知：站内信（必发）+ 按偏好发邮件（尽力而为）。
 *
 * @param params - 见 NotifyParams
 * @returns { inApp: boolean; email: 'sent' | 'skipped' | 'failed' | 'no_template' }
 *          inApp = 站内信是否写入成功；email = 邮件通道状态（no_template = 模板缺失纯站内信）
 */
export async function notifyUser(params: NotifyParams): Promise<{ inApp: boolean; email: NotifyEmailStatus }> {
  let inApp = false;

  // 1. 站内信（必发；写入失败仅记日志，不影响主链路）
  try {
    await db.insert(schema.notifications).values({
      userId: params.userId,
      type: params.event,
      title: params.title,
      content: params.content,
      metadata: (params.metadata ?? null) as any,
    });
    inApp = true;
  } catch (err) {
    console.error('[notify] in_app failed:', err);
  }

  // 2. 邮件（按策略，默认发送）
  const email = await sendEmailByPolicy(params);

  return { inApp, email };
}

/**
 * 按策略发送邮件（内部步骤：策略检查 → 模板查询 → 插值渲染 → sendMail）。
 * 任一步失败仅记日志并返回对应状态，不向上抛。
 */
async function sendEmailByPolicy(params: NotifyParams): Promise<NotifyEmailStatus> {
  try {
    // a. 通知策略：channel='email' && event_type=event；无策略行默认发送
    const policyDisabled = await isEmailPolicyDisabled(params.event);
    if (policyDisabled) return 'skipped';

    // b. 模板查询：不存在 → 纯站内信（预留模板名，本期不建模板）
    if (!params.templateName) return 'no_template';
    const tplRows = await db.select({
      subjectZh: schema.emailTemplates.subjectZh,
      bodyHtmlZh: schema.emailTemplates.bodyHtmlZh,
    }).from(schema.emailTemplates)
      .where(eq(schema.emailTemplates.name, params.templateName))
      .limit(1);
    const tpl = tplRows[0];
    if (!tpl) return 'no_template';

    // c. 插值渲染（{{变量}} String.replace；模板为后台受信内容，不做转义引擎）
    const subject = renderTemplate(tpl.subjectZh, params.templateVars);
    const html = renderTemplate(tpl.bodyHtmlZh, params.templateVars);

    // d. 收件邮箱 + 发送（sendMail 自身写 email_logs；SMTP 未配置返回 skipped 不抛错）
    const userRows = await db.select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, params.userId))
      .limit(1);
    const user = userRows[0];
    if (!user) return 'failed';

    const res = await sendMail({ to: user.email, subject, html, templateName: params.templateName });
    return res.ok ? 'sent' : res.skipped ? 'skipped' : 'failed';
  } catch (err) {
    console.error('[notify] email failed:', err);
    return 'failed';
  }
}

/**
 * 读取通知策略并判定邮件通道是否被禁用。
 *
 * @param event - 事件类型（如 'recharge_success'）
 * @returns true = 策略行存在且 enabled=false（跳过邮件）；否则默认发送
 */
async function isEmailPolicyDisabled(event: string): Promise<boolean> {
  try {
    const rows = await db.select({ value: schema.systemConfig.value })
      .from(schema.systemConfig)
      .where(eq(schema.systemConfig.key, 'notification_policies_list'))
      .limit(1);
    const raw = rows[0]?.value;
    if (!raw) return false;
    const arr = JSON.parse(raw) as Array<{ channel?: string; event_type?: string; enabled?: boolean }>;
    if (!Array.isArray(arr)) return false;
    const row = arr.find((p) => p.channel === 'email' && p.event_type === event);
    return !!row && row.enabled === false;
  } catch {
    return false; // 策略读取失败 → 默认发送（保守：通知比漏发好）
  }
}

/**
 * {{变量}} 简单插值：将模板中所有 {{key}} 替换为 templateVars[key]。
 * 缺失变量原样保留（运营侧模板自查）。
 *
 * @param template - 模板文本（subject 或 body html）
 * @param vars - 插值变量
 * @returns 渲染后文本
 */
function renderTemplate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, String(value));
  }
  return out;
}
