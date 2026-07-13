// ============================================================
//  3cloud (3C) — 兑换码通知服务
//  在兑换码事件发生时创建站内通知
// ============================================================

import { getDb } from "../db/index.js";
import { userNotifications, users, redemptionBatches } from "../db/schema.js";
import { eq, inArray } from "drizzle-orm";

// ──────────────────────────────────────────────
//  1. 兑换码被使用时 → 通知批次创建者
// ──────────────────────────────────────────────

export async function notifyCodeRedeemed(params: {
  batchId: number;
  codeId: number;
  code: string;
  redeemedBy: number;    // userId who redeemed
  amount: string;
}): Promise<void> {
  const db = getDb();

  // 查批次创建者
  const [batch] = await db
    .select({ creatorId: redemptionBatches.creatorId })
    .from(redemptionBatches)
    .where(eq(redemptionBatches.id, params.batchId))
    .limit(1);

  if (!batch) return;

  // 查询兑换者昵称
  const [redeemer] = await db
    .select({ nickname: users.nickname })
    .from(users)
    .where(eq(users.id, params.redeemedBy))
    .limit(1);

  const redeemerName = redeemer?.nickname ?? `用户 #${params.redeemedBy}`;

  await db.insert(userNotifications).values({
    userId: batch.creatorId,
    type: "redemption_used",
    title: "兑换码已被使用",
    content: `您的兑换码 ${params.code} 已被 ${redeemerName} 使用，到账 ¥${params.amount}`,
    refType: "redemption_code",
    refId: params.codeId,
  });
}

// ──────────────────────────────────────────────
//  2. 批次即将过期时（24h内）→ 通知创建者
// ──────────────────────────────────────────────

export async function notifyBatchExpiring(params: {
  batchId: number;
  batchName: string;
  expiresAt: Date;
  creatorId: number;
  unusedCount: number;
}): Promise<void> {
  const db = getDb();

  await db.insert(userNotifications).values({
    userId: params.creatorId,
    type: "redemption_expiring",
    title: "兑换码批次即将过期",
    content: `您的兑换码批次「${params.batchName}」将于 ${params.expiresAt.toISOString().slice(0, 16).replace("T", " ")} 过期，尚有 ${params.unusedCount} 个未使用兑换码`,
    refType: "redemption_batch",
    refId: params.batchId,
  });
}

// ──────────────────────────────────────────────
//  3. 风控事件触发时 → 通知所有管理员
// ──────────────────────────────────────────────

export async function notifyFraudAlert(params: {
  eventType: string;
  ip: string;
  severity: string;
  detail: string;
}): Promise<void> {
  const db = getDb();

  // 查询所有管理员角色用户（super_admin, admin, finance_ops, ops, support, auditor）
  const adminRoles = ["super_admin", "admin", "finance_ops", "ops", "support", "auditor"];
  const adminUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.role, adminRoles as any));

  if (adminUsers.length === 0) return;

  const severityLabel =
    params.severity === "critical" ? "严重" :
    params.severity === "high" ? "高危" : "警告";

  const now = new Date();

  // 批量插入通知
  await db.insert(userNotifications).values(
    adminUsers.map((u) => ({
      userId: u.id,
      type: "redemption_fraud" as const,
      title: `风控告警：${params.eventType}`,
      content: `【${severityLabel}】风控事件类型：${params.eventType}\nIP：${params.ip}\n详情：${params.detail}`,
      refType: "redemption_fraud",
      refId: null as unknown as number | undefined,
      createdAt: now,
    }))
  );
}

// ──────────────────────────────────────────────
//  4. 兑换码被作废时 → 通知批次创建者
// ──────────────────────────────────────────────

export async function notifyCodeRevoked(params: {
  codeId: number;
  code: string;
  batchId: number;
  revokedBy: number;
}): Promise<void> {
  const db = getDb();

  // 查批次创建者
  const [batch] = await db
    .select({ creatorId: redemptionBatches.creatorId })
    .from(redemptionBatches)
    .where(eq(redemptionBatches.id, params.batchId))
    .limit(1);

  if (!batch) return;

  // 查询操作者昵称
  const [operator] = await db
    .select({ nickname: users.nickname })
    .from(users)
    .where(eq(users.id, params.revokedBy))
    .limit(1);

  const operatorName = operator?.nickname ?? `管理员 #${params.revokedBy}`;

  await db.insert(userNotifications).values({
    userId: batch.creatorId,
    type: "redemption_revoked",
    title: "兑换码已被作废",
    content: `您的兑换码 ${params.code} 已被 ${operatorName} 作废`,
    refType: "redemption_code",
    refId: params.codeId,
  });
}
