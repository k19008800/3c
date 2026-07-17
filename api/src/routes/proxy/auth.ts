import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { getDb } from "../../db/index.js";
import { users, callLogs } from "../../db/schema.js";
import { authenticateApiKey } from "../../middleware/auth.js";
import {
  checkRateLimit,
  recordRequestForLimit,
  recordTokensForLimit,
} from "../../middleware/rate-limit.js";
import { getActiveUserQuota } from "../../services/quota-service.js";
import type { UserLimitCacheEntry } from "./types.js";

// ── 用户限流配置缓存（60 秒） ──
const userLimitCache = new Map<number, UserLimitCacheEntry>();

export async function getUserLimitInfo(userId: number): Promise<{
  userType: "personal" | "enterprise";
  rpmOverride: number | null;
  tpmOverride: number | null;
}> {
  const cached = userLimitCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) {
    return { userType: cached.userType, rpmOverride: cached.rpmOverride, tpmOverride: cached.tpmOverride };
  }

  const db = getDb();
  const [user] = await db
    .select({
      userType: users.userType,
      rpmOverride: users.rpmOverride,
      tpmOverride: users.tpmOverride,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return { userType: "personal", rpmOverride: null, tpmOverride: null };
  }

  const info = {
    userType: user.userType as "personal" | "enterprise",
    rpmOverride: user.rpmOverride,
    tpmOverride: user.tpmOverride,
  };
  userLimitCache.set(userId, { ...info, expiresAt: Date.now() + 60_000 });
  return info;
}

export function clearUserLimitCache() {
  userLimitCache.clear();
}

export { recordRequestForLimit, recordTokensForLimit };

/**
 * 代理路由的认证 + 限流 preHandler hook
 */
export function registerAuthHook(app: FastifyInstance) {
  // API Key 鉴权
  app.addHook("preHandler", authenticateApiKey);

  // 限流预检查
  app.addHook("preHandler", async (request, reply) => {
    if (!request.user) return;

    const userId = request.user.userId;
    const apiKeyId = request.apiKey?.id ?? null;
    const { userType, rpmOverride, tpmOverride } = await getUserLimitInfo(userId);

    let quotaRpmLimit: number | null | undefined;
    let quotaTpmLimit: number | null | undefined;
    try {
      const activeQuota = await getActiveUserQuota(userId);
      if (activeQuota) {
        quotaRpmLimit = activeQuota.rpmLimit;
        quotaTpmLimit = activeQuota.tpmLimit;
      }
    } catch {
      // 静默失败
    }

    const rejected = await checkRateLimit(
      userId, apiKeyId, userType, rpmOverride, tpmOverride,
      quotaRpmLimit, quotaTpmLimit,
    );
    if (rejected) {
      try {
        const db = getDb();
        await db.insert(callLogs).values({
          userId,
          apiKeyId,
          status: 'rate_limited',
          errorMessage: `请求频率超限（${rejected.dimension.toUpperCase()} ${rejected.level}: ${rejected.current}/${rejected.limit}）`,
          durationMs: 0,
          ip: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        });
      } catch { /* 静默 */ }

      reply.header("Retry-After", String(Math.ceil((rejected.retryAfterMs ?? 60000) / 1000)));
      return reply.status(429).send({
        error: {
          message: `请求频率超限（${rejected.dimension.toUpperCase()} ${rejected.level}: ${rejected.current}/${rejected.limit}）`,
          type: "rate_limit_error",
          code: "rate_limit_exceeded",
        },
      });
    }
  });
}
