// ============================================================
//  3cloud (3C) — 用户端配额路由
//  GET /api/v1/user/quota — 当前用户的配额列表+用量进度
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, gte, lte } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { userQuotas, keyQuotas, apiKeys } from "../db/schema.js";
import { authenticateJWT } from "../middleware/auth.js";

export async function userQuotaRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 获取当前用户的配额进度 ──
  app.get("/api/v1/user/quota", async (request, reply) => {
    const userId = request.user!.userId;
    const db = getDb();
    const now = new Date();

    // 获取用户级别的活跃配额
    const userQuotaList = await db
      .select()
      .from(userQuotas)
      .where(and(
        eq(userQuotas.userId, userId),
        lte(userQuotas.periodStart, now),
        gte(userQuotas.periodEnd, now),
      ))
      .limit(5);

    // 获取 Key 级别的配额（仅活跃 Key）
    const userApiKeys = await db
      .select({ id: apiKeys.id, name: apiKeys.name })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), eq(apiKeys.status, true)))
      .limit(20);

    const keyQuotaList = userApiKeys.length > 0
      ? await db
          .select({
            quota: keyQuotas,
            keyName: apiKeys.name,
            keyPrefix: apiKeys.keyPrefix,
          })
          .from(keyQuotas)
          .innerJoin(apiKeys, eq(keyQuotas.apiKeyId, apiKeys.id))
          .where(and(
            eq(apiKeys.userId, userId),
            lte(keyQuotas.periodStart, now),
            gte(keyQuotas.periodEnd, now),
          ))
          .limit(10)
      : [];

    // 格式化
    const formatQuota = (q: typeof userQuotas.$inferSelect) => {
      const amount = Number(q.quotaAmount);
      const used = Number(q.usedAmount);
      const pct = amount > 0 ? Math.round((used / amount) * 10000) / 100 : 0;
      return {
        id: q.id,
        quotaType: q.quotaType,
        quotaAmount: q.quotaAmount,
        usedAmount: q.usedAmount,
        usagePercent: pct,
        remaining: Math.max(0, amount - used).toFixed(4),
        periodStart: q.periodStart,
        periodEnd: q.periodEnd,
        rpmLimit: q.rpmLimit,
        tpmLimit: q.tpmLimit,
        isExceeded: used >= amount,
        isAlerting: amount > 0 && (used / amount) >= (Number(q.alertPercent) / 100),
      };
    };

    return {
      code: 0,
      data: {
        userQuotas: userQuotaList.map(formatQuota),
        keyQuotas: keyQuotaList.map((kq: any) => ({
          ...formatQuota(kq.quota),
          keyName: kq.keyName,
          keyPrefix: kq.keyPrefix,
        })),
      },
      message: "ok",
    };
  });
}
