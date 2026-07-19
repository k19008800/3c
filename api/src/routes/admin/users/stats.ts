// ============================================================
//  3cloud (3C) — 用户统计接口
//  GET /api/v1/admin/users/stats — 总用户数、活跃、本月新增、今日新增
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, sql, gte } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { users } from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";

export async function statsRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/stats — 统计卡片
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/users/stats", {
    preHandler: [requirePerm(Perm.USER_LIST)],
  }, async (_request, reply) => {
    const db = getDb();

    const now = new Date();

    // 本月起始
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    // 今日起始
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users);

    const [activeResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.status, "active"));

    const [newMonthResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(gte(users.createdAt, monthStart));

    const [newTodayResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(gte(users.createdAt, dayStart));

    reply.status(200).send({
      code: 0,
      data: {
        totalUsers: Number(totalResult?.count ?? 0),
        activeUsers: Number(activeResult?.count ?? 0),
        newThisMonth: Number(newMonthResult?.count ?? 0),
        newToday: Number(newTodayResult?.count ?? 0),
      },
      message: "ok",
    });
  });
}
