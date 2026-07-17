// ============================================================
//  3cloud (3C) — 实名审核通知
//  实名审核完成后，发送邮件 + 站内信
// ============================================================

import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { users as usersTable } from "../../db/schema.js";
import { sendRealNameResultEmail } from "../email-service.js";
import { logger } from "../../logger.js";
import { createNotification } from "./core.js";
import { RealNameReviewNotifParams } from "./types.js";

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
    userType: "personal",
  }).catch((err) => {
    logger.error({ err, userId: params.userId }, "[Notif] 邮件发送失败");
  });
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
