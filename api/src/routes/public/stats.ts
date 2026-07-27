// ============================================================
//  3cloud (3C) — 公开统计信息（无需认证，用于门户首页）
//  GET /api/v1/public/stats — 平台公开统计
// ============================================================

import { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { getRedis } from "../../redis.js";

export async function publicStatsRoutes(app: FastifyInstance) {
  app.get("/api/v1/public/stats", async (_request, reply) => {
    const redis = getRedis();

    try {
      const cached = await redis.get("public:stats");
      if (cached) {
        reply.send(JSON.parse(cached));
        return;
      }
    } catch {}

    const db = getDb();

    const modelRes = await db.execute(sql`SELECT count(*)::int as count FROM models`);
    const vendorRes = await db.execute(sql`SELECT count(*)::int as count FROM vendors`);
    const userRes = await db.execute(sql`SELECT count(*)::int as count FROM users`);
    const tokenRes = await db.execute(sql`
      SELECT coalesce(sum(total_tokens), 0)::bigint as total_tokens
      FROM call_logs
    `);

    const modelRow = (modelRes.rows?.[0] || modelRes[0]) as any || { count: 0 };
    const vendorRow = (vendorRes.rows?.[0] || vendorRes[0]) as any || { count: 0 };
    const userRow = (userRes.rows?.[0] || userRes[0]) as any || { count: 0 };
    const tokenRow = (tokenRes.rows?.[0] || tokenRes[0]) as any || { total_tokens: 0 };

    const result = {
      code: 0,
      data: {
        models: modelRow.count ?? 0,
        vendors: vendorRow.count ?? 0,
        users: userRow.count ?? 0,
        totalTokens: tokenRow.total_tokens ?? 0,
      },
      message: "ok",
    };

    // 缓存 5 分钟
    redis.setex("public:stats", 300, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });
}
