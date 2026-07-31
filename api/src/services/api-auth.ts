import { eq, and, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "../db/index";
import { apiKeys } from "../db/schema/api-keys";
import { users } from "../db/schema/users";

/**
 * API Key 鉴权 service（§5 API 网关前置）
 * 校验边界：
 * - Key 存在且未软删除
 * - Key 状态 active
 * - 未过期
 * - 用户状态 active
 * - 余额充足（> 0 才允许调用，防止负数余额调用）
 */

export interface AuthenticatedContext {
  apiKeyId: number;
  userId: number;
  keyStatus: string;
  userBalance: number; // 分
  modelWhitelist?: string | null;
}

/** 计算 key 的哈希（SHA-256） */
export function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** 从明文 key 提取前缀（如 sk-abc123 → sk-abc123 前 12 位） */
export function keyPrefixOf(secret: string): string {
  return secret.length > 12 ? secret.slice(0, 12) : secret;
}

/**
 * 鉴权：校验 API Key 并返回上下文
 * @param secret 明文 API Key（如 sk-xxx）
 */
export async function authenticateApiKey(secret: string): Promise<{ ok: true; ctx: AuthenticatedContext } | { ok: false; error: string; code: string }> {
  const keyHash = hashApiKey(secret);

  const key = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.deletedAt)))
    .limit(1);

  const k = key[0];
  if (!k) return { ok: false, code: "KEY_INVALID", error: "API Key 无效" };

  // 状态
  if (k.status === "disabled") return { ok: false, code: "KEY_DISABLED", error: "API Key 已被禁用" };
  if (k.status === "expired") return { ok: false, code: "KEY_EXPIRED", error: "API Key 已过期" };

  // 过期时间
  if (k.expiresAt && new Date(k.expiresAt) < new Date()) {
    return { ok: false, code: "KEY_EXPIRED", error: "API Key 已过期" };
  }

  // 用户
  const user = await db.select().from(users).where(eq(users.id, k.userId)).limit(1);
  const u = user[0];
  if (!u) return { ok: false, code: "USER_NOT_FOUND", error: "用户不存在" };
  if (u.status === "disabled") return { ok: false, code: "USER_DISABLED", error: "用户已被禁用" };

  // 余额（>0 才可调用；负余额拒绝）
  if ((u.balance ?? 0) <= 0) return { ok: false, code: "INSUFFICIENT_BALANCE", error: "余额不足，请先充值" };

  // 更新 last_used_at
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, k.id)).catch(() => {});

  return {
    ok: true,
    ctx: {
      apiKeyId: k.id,
      userId: k.userId,
      keyStatus: k.status,
      userBalance: u.balance ?? 0,
      modelWhitelist: k.modelWhitelist,
    },
  };
}

/**
 * 模型白名单校验
 */
export function isModelAllowed(ctx: AuthenticatedContext, modelName: string): boolean {
  if (!ctx.modelWhitelist) return true; // 空=全部
  const allowed = ctx.modelWhitelist.split(",").map((m) => m.trim()).filter(Boolean);
  return allowed.includes(modelName);
}

/**
 * 从 Authorization header 解析 Bearer key
 */
export function extractBearerKey(authorization?: string): string | null {
  if (!authorization) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authorization);
  return m ? m[1]!.trim() : null;
}
