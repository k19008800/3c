// ============================================================
//  3cloud (3C) — Admin Dashboard 消费排行
//  GET /api/v1/admin/dashboard/top-consumers
// ============================================================

import { FastifyInstance } from "fastify";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { getRedis } from "../../../redis.js";
import { users, callLogs } from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";

export async function topConsumersRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/dashboard/top-consumers", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const redis = getRedis();

    try {
      const cached = await redis.get("dashboard:top-consumers");
      if (cached) return reply.send(JSON.parse(cached));
    } catch {}

    const db = getDb();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // 1. Top 20 消费用户
    const topConsumers = await db
      .select({
        userId: callLogs.userId,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
        totalCalls: sql<number>`count(*)::int`,
      })
      .from(callLogs)
      .groupBy(callLogs.userId)
      .orderBy(sql`sum(${callLogs.cost}::numeric) desc`)
      .limit(20);

    const monthTopConsumers = await db
      .select({
        userId: callLogs.userId,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
        totalCalls: sql<number>`count(*)::int`,
      })
      .from(callLogs)
      .where(gte(callLogs.createdAt, monthStart))
      .groupBy(callLogs.userId);

    const monthCostMap = new Map(monthTopConsumers.map((r) => [r.userId, r]));

    const userIds = topConsumers.map((r) => r.userId);
    const consumerUsers = userIds.length > 0
      ? await db
        .select({
          id: users.id,
          email: users.email,
          nickname: users.nickname,
          userType: users.userType,
          balance: users.balance,
          status: users.status,
          companyName: users.companyName,
        })
        .from(users)
        .where(inArray(users.id, userIds))
      : [];

    const userMap = new Map(consumerUsers.map((u) => [u.id, u]));

    // 2. 低余额用户
    const lowBalanceList = await db
      .select({
        id: users.id,
        email: users.email,
        nickname: users.nickname,
        companyName: users.companyName,
        balance: users.balance,
        userType: users.userType,
        realNameStatus: users.realNameStatus,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(
        and(
          sql`${users.balance}::numeric < 10`,
          sql`${users.deletedAt} IS NULL`,
          eq(users.status, "active")
        )
      )
      .orderBy(sql`${users.balance}::numeric asc`)
      .limit(10);

    const result = {
      code: 0,
      data: {
        topConsumers: topConsumers.map((r) => {
          const u = userMap.get(r.userId);
          const m = monthCostMap.get(r.userId);
          return {
            userId: r.userId,
            email: u?.email ?? "unknown",
            nickname: u?.nickname ?? null,
            userType: u?.userType ?? "personal",
            companyName: u?.companyName ?? null,
            totalConsumption: r.totalCost,
            totalCalls: r.totalCalls,
            monthConsumption: m?.totalCost ?? "0",
            balance: u?.balance ?? "0",
          };
        }),
        lowBalanceUsers: lowBalanceList.map((u) => ({
          id: u.id,
          email: u.email,
          nickname: u.nickname,
          companyName: u.companyName,
          balance: u.balance,
          userType: u.userType,
        })),
        lowBalanceCount: lowBalanceList.length,
      },
      message: "ok",
    };

    redis.setex("dashboard:top-consumers", 120, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });
}
