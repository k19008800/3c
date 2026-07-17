// ============================================================
//  3cloud (3C) — 实名认证 自动核验编排
// ============================================================

import { eq, and } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { users, userRealNameReviews, auditLogs } from "../../db/schema.js";
import { VerifyProviderFactory } from "../real-name-verify/provider.js";
import type { AutoVerifyResult } from "./types.js";
import { loadSystemConfigs } from "./system-config.js";

/**
 * 用户提交实名信息后执行自动核验
 *
 * 从 user_real_name_reviews 表读取提交的实名信息快照，
 * 调用 VerifyProviderFactory 执行第三方核验。
 * 核验通过后自动更新用户表及审核记录。
 */
export async function autoVerifyRealName(userId: number, version: number): Promise<AutoVerifyResult> {
  const configs = await loadSystemConfigs();
  const enabled = configs["real_name_auto_verify"];

  if (enabled !== "true") {
    return { autoVerified: false, passed: false };
  }

  const providerName = configs["real_name_verify_provider"] || "aliyun";
  const appCode = configs["aliyun_id_verify_app_code"] || "";

  // provider 为 "none" 时走人工审核
  if (providerName === "none") {
    return { autoVerified: false, passed: false };
  }

  if (!appCode) {
    console.warn(`[RealName] 自动核验已启用但未配置 AppCode，跳过`);
    return { autoVerified: false, passed: false };
  }

  // 从审核记录表读取提交的实名信息快照
  const db = getDb();
  const [review] = await db
    .select()
    .from(userRealNameReviews)
    .where(
      and(
        eq(userRealNameReviews.userId, userId),
        eq(userRealNameReviews.version, version),
      ),
    )
    .limit(1);

  if (!review) {
    return { autoVerified: false, passed: false };
  }

  if (!review.realName || !review.idNumber) {
    return { autoVerified: false, passed: false };
  }

  // 获取用户类型（个人/企业）
  const [user] = await db
    .select({ userType: users.userType })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const provider = VerifyProviderFactory.create(providerName, appCode);
  let result: { passed: boolean; rawResponse: Record<string, any> };

  try {
    if (
      user?.userType === "enterprise" &&
      review.companyName &&
      review.companyRegNumber
    ) {
      result = await provider.verifyEnterprise({
        realName: review.realName,
        idNumber: review.idNumber,
        companyName: review.companyName,
        companyRegNumber: review.companyRegNumber,
      });
    } else {
      result = await provider.verifyPersonal({
        realName: review.realName,
        idNumber: review.idNumber,
      });
    }
  } catch (err) {
    console.error(`[RealName] 自动核验失败 (userId=${userId}):`, err);
    // 核验异常不阻断流程，改为人工审核
    return { autoVerified: true, passed: false, rawResult: { error: String(err) } };
  }

  if (result.passed) {
    // 核验通过 → 更新 users 表 + 审核记录
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          realNameStatus: "approved",
          realName: review.realName,
          idNumber: review.idNumber,
        })
        .where(eq(users.id, userId));

      await tx
        .update(userRealNameReviews)
        .set({ status: "approved" })
        .where(eq(userRealNameReviews.id, review.id));
    });

    // 发送通知（不阻塞）
    const { notifyRealNameReviewResult } = await import("../notification-service.js");
    const [userInfo] = await db
      .select({
        email: users.email,
        nickname: users.nickname,
        realName: users.realName,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userInfo) {
      notifyRealNameReviewResult({
        userId,
        email: userInfo.email,
        nickname: userInfo.nickname,
        realName: userInfo.realName || "用户",
        status: "approved",
      }).catch((err: any) => {
        console.error(`自动审核通知发送失败 (userId=${userId}):`, err);
      });
    }

    return { autoVerified: true, passed: true, rawResult: result.rawResponse };
  }

  // 核验不通过 → 标记为 rejected
  await db
    .update(userRealNameReviews)
    .set({ status: "rejected", rejectReason: "自动核验失败：信息不一致" })
    .where(eq(userRealNameReviews.id, review.id));

  return { autoVerified: true, passed: false, rawResult: result.rawResponse };
}

/**
 * 自动通过实名认证
 */
export async function autoApproveRealName(
  userId: number,
  version: number,
  verifyResult: Record<string, any>,
): Promise<void> {
  const db = getDb();

  const now = new Date();

  await db.transaction(async (tx) => {
    // 更新 users 表
    await tx
      .update(users)
      .set({ realNameStatus: "approved" })
      .where(eq(users.id, userId));

    // 更新审核记录
    await tx
      .update(userRealNameReviews)
      .set({
        status: "approved",
        reviewedAt: now,
        // 将核验结果存入 rejectReason 字段（临时方案，避免改表）
        // 实际可以通过在 user_real_name_reviews 表加 verify_result text 字段
        rejectReason: verifyResult
          ? `[auto_verify] ${JSON.stringify(verifyResult)}`
          : "[auto_verify] passed",
      })
      .where(
        and(
          eq(userRealNameReviews.userId, userId),
          eq(userRealNameReviews.version, version),
        )
      );

    // 审计日志
    await tx.insert(auditLogs).values({
      operatorId: 0,        // 系统自动操作
      action: "real_name_approve",
      targetType: "user",
      targetId: userId,
      before: { realNameStatus: "pending_review" },
      after: { realNameStatus: "approved" },
      ip: "system",
      description: `实名自动审核通过（第三方核验）`,
    });
  });

  // 发送通知（不阻塞事务）
  const { notifyRealNameReviewResult } = await import("../notification-service.js");
  const [userInfo] = await getDb()
    .select({
      email: users.email,
      nickname: users.nickname,
      realName: users.realName,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (userInfo) {
    notifyRealNameReviewResult({
      userId,
      email: userInfo.email,
      nickname: userInfo.nickname,
      realName: userInfo.realName || "用户",
      status: "approved",
    }).catch((err: any) => {
      console.error(`自动审核通知发送失败 (userId=${userId}):`, err);
    });
  }
}
