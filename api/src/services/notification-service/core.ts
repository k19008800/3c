// ============================================================
//  3cloud (3C) — 通知服务核心
//  站内信创建 + 邮件发送辅助
// ============================================================

import { getDb } from "../../db/index.js";
import { userNotifications } from "../../db/schema.js";
import { logger } from "../../logger.js";
import { CreateNotificationParams } from "./types.js";

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

/**
 * 邮件发送辅助函数，统一处理异步发送和错误日志
 */
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
