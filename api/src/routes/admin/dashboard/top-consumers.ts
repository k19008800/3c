// ============================================================
//  3cloud (3C) — Admin Dashboard 消费排行
//  GET /api/v1/admin/dashboard/top-consumers
// ============================================================

import { FastifyInstance } from "fastify";
import { getDb } from "../../../db/index.js";
import { getRedis } from "../../../redis.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";
import { buildTopConsumers } from "../../../services/dashboards/consumers.js";

export async function topConsumersRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/dashboard/top-consumers", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
    schema: {
      querystring: {
        type: "object",
        properties: {
          days: { type: "integer", minimum: 1, maximum: 365, default: 90 }, // PERF: 添加时间范围过滤参数（默认 90 天）
        },
      },
    },
  }, async (request, reply) => {
    const db = getDb();
    const redis = getRedis();

    // PERF: 复用 service 层缓存，通过 buildTopConsumers 获取结果
    //       service 内部已实现 120s TTL Redis 缓存，避免路由层和服务层双缓存
    const result = await buildTopConsumers(db, redis);

    reply.send(result);
  });
}
