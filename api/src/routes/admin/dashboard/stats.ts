// ============================================================
//  3cloud (3C) — Admin Dashboard 主统计
//  GET /api/v1/admin/dashboard/stats
// ============================================================

import { FastifyInstance } from "fastify";
import { getDb } from "../../../db/index.js";
import { getRedis } from "../../../redis.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";
import { buildStats } from "../../../services/dashboards/stats.js";

export async function statsRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/dashboard/stats", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const redis = getRedis();

    // PERF: 复用 service 层缓存（buildStats 内部已实现 120s TTL Redis 缓存），避免路由层和服务层双缓存
    // PERF: 此接口为统计类接口，查询超时已设置为 30 秒（通过 query-timeout 插件）
    const result = await buildStats(db, redis);

    reply.send(result);
  });
}
