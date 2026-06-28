// ============================================================
//  3cloud (3C) — 通知服务
//  站内信 + 邮件通知编排
// ============================================================

import { getDb } from "../db/index.js";
import { userNotifications, notificationTypeEnum } from "../db/schema.js";
import { sendRealNameResultEmail } from "./email-service.js";

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
    console.error(`[Notif] 站内信创建失败 (userId=${params.userId}):`, err);
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
    console.error(`[Notif] 邮件发送失败 (userId=${params.userId}):`, err);
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
  const { users } = await import("../db/schema.js");
  const { eq } = await import("drizzle-orm");

  const [user] = await db
    .select({
      email: users.email,
      nickname: users.nickname,
      realName: users.realName,
      userType: users.userType,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    console.error(`[Notif] 用户不存在 (userId=${userId})，无法发送通知`);
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
