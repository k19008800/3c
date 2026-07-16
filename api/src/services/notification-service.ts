// ============================================================
//  3cloud (3C) — 通知服务
//  站内信 + 邮件通知编排
// ============================================================

import { getDb } from "../db/index.js";
import { userNotifications, notificationTypeEnum, users as usersTable, agents as agentsTable } from "../db/schema.js";
import { sendRealNameResultEmail, sendLoginAlertEmail, sendEmail } from "./email-service.js";
import { logger } from "../logger.js";
import { eq } from "drizzle-orm";
// PERF: 顶部静态导入 email-service 和 drizzle-orm，消除所有函数内动态 import

// ──────────────────────────────────────────────
//  站内信
// ──────────────────────────────────────────────

export interface CreateNotificationParams {
  userId: number;
  type: string;           // real_name_approved / real_name_rejected / ...
  title: string;
  content: string;
  refType?: string;       // 关联类型，如 "real_name"
  refId?: number;         // 关联 ID
}

/**
 * 创建站内通知
 */
export async function createNotification(
  params: CreateNotificationParams,
): Promise<void> {
  const db = getDb();
  await db.insert(userNotifications).values({
    userId: params.userId,
    type: params.type as any,
    title: params.title,
    content: params.content,
    refType: params.refType ?? null,
    refId: params.refId ?? null,
  });
}

// ──────────────────────────────────────────────
//  实名审核结果通知
// ──────────────────────────────────────────────

export interface RealNameReviewNotifParams {
  userId: number;
  email: string;
  nickname: string | null;
  realName: string;
  status: "approved" | "rejected";
  rejectReason?: string | null;
  reviewVersion?: number;
}

/**
 * 实名审核完成后，发送邮件 + 站内信
 */
export async function notifyRealNameReviewResult(
  params: RealNameReviewNotifParams,
): Promise<void> {
  const isApproved = params.status === "approved";
  const title = isApproved ? "实名认证已通过" : "实名认证未通过";
  const content = isApproved
    ? `您好，您的实名认证（${params.realName}）已审核通过。`
    : `您好，您的实名认证（${params.realName}）未通过审核。原因：${params.rejectReason || "信息不完整或不准确"}。请登录后重新提交。`;

  // 1. 站内信（同步）
  try {
    await createNotification({
      userId: params.userId,
      type: isApproved ? "real_name_approved" : "real_name_rejected",
      title,
      content,
      refType: "real_name",
      refId: params.reviewVersion ?? undefined,
    });
  } catch (err) {
    logger.error({ err, userId: params.userId }, "[Notif] 站内信创建失败");
  }

  // 2. 邮件（异步，不阻塞响应）
  sendRealNameResultEmail({
    toEmail: params.email,
    nickname: params.nickname,
    realName: params.realName,
    isApproved,
    rejectReason: params.rejectReason,
    userType: "personal", // 具体类型可从用户数据获取
  }).catch((err) => {
    logger.error({ err, userId: params.userId }, "[Notif] 邮件发送失败");
  });
}

// ══════════════════════════════════════════════
//  新增通知类型便利函数
// ══════════════════════════════════════════════

/**
 * 余额不足通知
 */
export async function notifyBalanceLow(
  userId: number,
  balance: string,
  threshold: string,
): Promise<void> {
  await createNotification({
    userId,
    type: "balance_low",
    title: "余额不足提醒",
    content: `您的账户余额为 ${balance}，已低于阈值 ${threshold}。请及时充值以免影响服务使用。`,
  }).catch((err) => logger.error({ err, userId }, "[Notif] balance_low 通知失败"));
}

/**
 * 额度告警通知
 */
export async function notifyQuotaWarning(
  userId: number,
  usage: string,
  limit: string,
  exceeded: boolean = false,
): Promise<void> {
  const type = exceeded ? "quota_exceeded" : "quota_warning";
  const title = exceeded ? "额度已超限" : "额度使用警告";
  const content = exceeded
    ? `您的 API 额度已超限（使用量: ${usage}，上限: ${limit}），部分请求可能被限制。`
    : `您的 API 额度即将用尽（使用量: ${usage}/${limit}），请注意控制用量。`;
  await createNotification({ userId, type, title, content }).catch(
    (err) => logger.error({ err, userId }, "[Notif] quota 通知失败"),
  );
}

/**
 * 提现结果通知
 */
export async function notifyWithdrawResult(
  userId: number,
  status: "approved" | "rejected" | "paid",
  amount: string,
  rejectReason?: string,
): Promise<void> {
  const title = status === "paid"
    ? "提现已打款"
    : status === "approved"
    ? "提现已审核通过"
    : "提现申请未通过";
  const content = status === "paid"
    ? `您的提现申请（金额: ${amount}）已完成打款，请查收。`
    : status === "approved"
    ? `您的提现申请（金额: ${amount}）已审核通过，等待打款。`
    : `您的提现申请（金额: ${amount}）未通过审核。${rejectReason ? `原因：${rejectReason}` : ""}`;
  await createNotification({ userId, type: "withdraw_result", title, content }).catch(
    (err) => logger.error({ err, userId }, "[Notif] withdraw_result 通知失败"),
  );
}

/**
 * 佣金结算通知
 */
export async function notifyCommissionSettled(
  userId: number,
  amount: string,
  period: string,
): Promise<void> {
  await createNotification({
    userId,
    type: "commission_settled",
    title: "佣金结算通知",
    content: `您的佣金已结算（金额: ${amount}，结算周期: ${period}）。`,
  }).catch((err) => logger.error({ err, userId }, "[Notif] commission_settled 通知失败"));
}

/**
 * 代理商客户事件通知
 */
export async function notifyAgentClientEvent(
  userId: number,
  event: string,
  clientName: string,
): Promise<void> {
  await createNotification({
    userId,
    type: "agent_client_event",
    title: "客户事件通知",
    content: `客户 ${clientName} ${event}`,
  }).catch((err) => logger.error({ err, userId }, "[Notif] agent_client_event 通知失败"));
}

/**
 * 新模型上线通知
 */
export async function notifyNewModel(
  userId: number,
  modelName: string,
): Promise<void> {
  await createNotification({
    userId,
    type: "new_model",
    title: "新模型上线",
    content: `新模型 ${modelName} 已上线，欢迎体验。`,
  }).catch((err) => logger.error({ err, userId }, "[Notif] new_model 通知失败"));
}

/**
 * 兑换成功通知
 */
export async function notifyRedemptionSuccess(
  userId: number,
  amount: string,
  code: string,
): Promise<void> {
  await createNotification({
    userId,
    type: "redemption_success",
    title: "兑换成功",
    content: `兑换码 ${code.slice(0, 8)}... 兑换成功，余额增加 ${amount}。`,
    refType: "redemption",
  }).catch((err) => logger.error({ err, userId }, "[Notif] redemption_success 通知失败"));
}

// PERF: 邮件发送辅助函数，统一处理异步发送和错误日志
export async function sendEmailAsync(
  emailFn: () => any,
  context: Record<string, any>,
  label: string,
): Promise<void> {
  try {
    await emailFn();
  } catch (err) {
    logger.error({ err, ...context }, `[Notif] ${label} 发送失败`);
  }
}

/**
 * 根据用户 ID 获取 email 等信息的快捷函数
 */
export async function notifyRealNameReviewByUserId(
  userId: number,
  status: "approved" | "rejected",
  rejectReason?: string | null,
): Promise<void> {
  const db = getDb();
  // PERF: 使用顶部静态导入，消除动态 import

  const [user] = await db
    .select({
      email: usersTable.email,
      nickname: usersTable.nickname,
      realName: usersTable.realName,
      userType: usersTable.userType,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    logger.error({ userId }, "[Notif] 用户不存在，无法发送通知");
    return;
  }

  await notifyRealNameReviewResult({
    userId,
    email: user.email,
    nickname: user.nickname,
    realName: user.realName || "用户",
    status,
    rejectReason,
  });
}

// ══════════════════════════════════════════════
//  新增通知函数集
// ══════════════════════════════════════════════

/**
 * 异常登录通知
 */
export async function notifyUnusualLogin(
  userId: number,
  email: string,
  ip: string,
  city: string,
  device: string,
): Promise<void> {
  await createNotification({
    userId,
    type: "login_alert",
    title: "异常登录提醒",
    content: `检测到异常登录：IP ${ip}，位置 ${city}，设备 ${device}。如非本人操作请及时修改密码。`,
    refType: "login_alert",
  }).catch((err) => { logger.error({ err, userId }, "[Notif] login_alert 通知失败"); });

  // PERF: 使用静态导入 + sendEmailAsync 辅助函数
  await sendEmailAsync(
    () => sendLoginAlertEmail({
      toEmail: email,
      nickname: null,
      city,
      country: "",
      ip,
      device,
    }),
    { userId },
    "login_alert",
  );
}

/**
 * API Key 创建通知
 */
export async function notifyApiKeyCreated(
  userId: number,
  email: string,
  keyName: string,
): Promise<void> {
  await createNotification({
    userId,
    type: "api_key_event",
    title: "API Key 已创建",
    content: `新的 API Key「${keyName}」已创建。请妥善保管密钥。`,
    refType: "api_key",
  }).catch((err) => { logger.error({ err, userId }, "[Notif] api_key_created 通知失败"); });

  // PERF: 使用静态导入 + sendEmailAsync 辅助函数
  await sendEmailAsync(
    () => sendEmail({
      to: email,
      subject: "API Key 已创建 — 3cloud",
      html: `<p>您好，</p><p>您的 API Key「${keyName}」已成功创建。</p><p>请登录控制台查看并妥善保管密钥信息。</p>`,
    }),
    { userId },
    "api_key_created",
  );
}

/**
 * API Key 删除通知
 */
export async function notifyApiKeyDeleted(
  userId: number,
  email: string,
  keyName: string,
): Promise<void> {
  await createNotification({
    userId,
    type: "api_key_event",
    title: "API Key 已删除",
    content: `API Key「${keyName}」已被删除。使用该密钥的应用将无法继续调用。`,
    refType: "api_key",
  }).catch((err) => { logger.error({ err, userId }, "[Notif] api_key_deleted 通知失败"); });

  // PERF: 使用静态导入 + sendEmailAsync 辅助函数
  await sendEmailAsync(
    () => sendEmail({
      to: email,
      subject: "API Key 已删除 — 3cloud",
      html: `<p>您好，</p><p>您的 API Key「${keyName}」已被删除。</p><p>如非本人操作，请立即检查账户安全。</p>`,
    }),
    { userId },
    "api_key_deleted",
  );
}

/**
 * 限流警告通知
 */
export async function notifyRateLimitWarned(
  userId: number,
  email: string,
  limitType: string,
  currentUsage: string,
): Promise<void> {
  await createNotification({
    userId,
    type: "quota_warning",
    title: "速率限制警告",
    content: `${limitType} 当前使用量 ${currentUsage}，即将达到限制。请合理控制调用频率。`,
    refType: "rate_limit",
  }).catch((err) => { logger.error({ err, userId }, "[Notif] rate_limit 通知失败"); });

  // PERF: 使用静态导入 + sendEmailAsync 辅助函数
  await sendEmailAsync(
    () => sendEmail({
      to: email,
      subject: "速率限制警告 — 3cloud",
      html: `<p>您好，</p><p>您的 ${limitType} 当前使用量 ${currentUsage}，即将达到限制。</p><p>请合理控制调用频率，以免影响服务使用。</p>`,
    }),
    { userId },
    "rate_limit",
  );
}

/**
 * 佣金结算完成通知（发送给代理商）
 */
export async function notifySettlementComplete(
  agentId: number,
  amount: string,
  count: number,
): Promise<void> {
  const db = getDb();
  // PERF: 使用顶部静态导入，消除动态 import

  // 查找代理商关联的用户
  const [agent] = await db
    .select({
      userId: agentsTable.userId,
      email: usersTable.email,
    })
    .from(agentsTable)
    .innerJoin(usersTable, eq(agentsTable.userId, usersTable.id))
    .where(eq(agentsTable.id, agentId))
    .limit(1);

  if (!agent) {
    logger.error({ agentId }, "[Notif] 代理商不存在，无法发送结算通知");
    return;
  }

  await createNotification({
    userId: agent.userId,
    type: "commission_settled",
    title: "佣金结算完成",
    content: `本期佣金已结算 ${count} 笔，总金额 ${amount}，请查收。`,
    refType: "commission_settlement",
  }).catch((err) => { logger.error({ err, agentId }, "[Notif] settlement 通知失败"); });

  // PERF: 使用静态导入 + sendEmailAsync 辅助函数
  await sendEmailAsync(
    () => sendEmail({
      to: agent.email,
      subject: "佣金结算通知 — 3cloud",
      html: `<p>您好，</p><p>本期佣金已结算 <strong>${count}</strong> 笔，总金额 <strong>${amount}</strong> 元。</p><p>请登录代理商后台查看明细。</p>`,
    }),
    { agentId },
    "settlement",
  );
}


/**
 * 账户封禁通知
 */
export async function notifyAccountBanned(
  userId: number,
  reason: string,
  duration?: string,
): Promise<void> {
  const title = duration ? `账户已封禁（${duration}）` : "账户已封禁";
  await createNotification({
    userId,
    type: "account_banned",
    title,
    content: `您的账户因以下原因已被封禁：${reason}${duration ? `，期限：${duration}` : ""}。如有疑问请联系客服。`,
    refType: "account_banned",
  }).catch((err) => logger.error({ err, userId }, "[Notif] account_banned 通知失败"));
}

/**
 * 兑换码已使用通知
 */
export async function notifyRedemptionUsed(
  userId: number,
  code: string,
  amount: string,
): Promise<void> {
  await createNotification({
    userId,
    type: "redemption_used",
    title: "兑换码已使用",
    content: `兑换码 ${code.slice(0, 8)}... 已被使用（金额 ${amount}），该兑换码将不可再次使用。`,
    refType: "redemption",
  }).catch((err) => logger.error({ err, userId }, "[Notif] redemption_used 通知失败"));
}

/**
 * 兑换码即将过期通知
 */
export async function notifyRedemptionExpiring(
  userId: number,
  code: string,
  expiresAt: string,
): Promise<void> {
  await createNotification({
    userId,
    type: "redemption_expiring",
    title: "兑换码即将过期",
    content: `兑换码 ${code.slice(0, 8)}... 将于 ${expiresAt} 过期，请尽快使用。`,
    refType: "redemption",
  }).catch((err) => logger.error({ err, userId }, "[Notif] redemption_expiring 通知失败"));
}

/**
 * 兑换码风控告警通知
 */
export async function notifyRedemptionFraud(
  userId: number,
  code: string,
  reason: string,
): Promise<void> {
  await createNotification({
    userId,
    type: "redemption_fraud",
    title: "兑换风控告警",
    content: `兑换码 ${code.slice(0, 8)}... 触发了风控策略：${reason}。如有疑问请联系客服。`,
    refType: "redemption",
  }).catch((err) => logger.error({ err, userId }, "[Notif] redemption_fraud 通知失败"));
}

/**
 * 兑换码已撤销通知
 */
export async function notifyRedemptionRevoked(
  userId: number,
  code: string,
  reason: string,
): Promise<void> {
  await createNotification({
    userId,
    type: "redemption_revoked",
    title: "兑换码已撤销",
    content: `兑换码 ${code.slice(0, 8)}... 已被撤销。原因：${reason}。`,
    refType: "redemption",
  }).catch((err) => logger.error({ err, userId }, "[Notif] redemption_revoked 通知失败"));
}
