// ============================================================
//  3cloud (3C) — Admin Dashboard 营收分析
//  GET /api/v1/admin/dashboard/revenue-analysis
// ============================================================

import { FastifyInstance } from "fastify";
import { getDb } from "../../../db/index.js";
import { getRedis } from "../../../redis.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";
import { buildRevenue } from "../../../services/dashboards/revenue.js";

export async function revenueRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/dashboard/revenue-analysis", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const redis = getRedis();

    // PERF: 复用 service 层缓存（buildRevenue 内部已实现 120s TTL Redis 缓存），
    //       避免路由层和服务层双缓存，消除重复全表扫描
    const result = await buildRevenue(db, redis);

    reply.send(result);
  });
}
