// ============================================================
//  3cloud (3C) — Admin Dashboard 最近活跃
//  GET /api/v1/admin/dashboard/recent-activity
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { users, callLogs, rechargeOrders } from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";

export async function recentActivityRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/dashboard/recent-activity", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const db = getDb();

    // 最近 10 条充值
    const recentRecharges = await db
      .select({
        id: rechargeOrders.id,
        userId: rechargeOrders.userId,
        orderNo: rechargeOrders.orderNo,
        amount: rechargeOrders.amount,
        channel: rechargeOrders.channel,
        status: rechargeOrders.status,
        createdAt: rechargeOrders.createdAt,
        email: users.email,
        nickname: users.nickname,
      })
      .from(rechargeOrders)
      .leftJoin(users, eq(rechargeOrders.userId, users.id))
      .orderBy(sql`${rechargeOrders.createdAt} desc`)
      .limit(10);

    // 最近 10 次调用
    const recentCalls = await db
      .select({
        id: callLogs.id,
        userId: callLogs.userId,
        modelName: callLogs.modelName,
        status: callLogs.status,
        totalTokens: callLogs.totalTokens,
        cost: callLogs.cost,
        durationMs: callLogs.durationMs,
        createdAt: callLogs.createdAt,
        email: users.email,
      })
      .from(callLogs)
      .leftJoin(users, eq(callLogs.userId, users.id))
      .orderBy(sql`${callLogs.createdAt} desc`)
      .limit(10);

    reply.send({
      code: 0,
      data: {
        recentRecharges,
        recentCalls,
      },
      message: "ok",
    });
  });
}
