// ============================================================
//  3cloud (3C) — Admin Dashboard 运营待办队列
//  GET /api/v1/admin/dashboard/todo-queue
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, gte, sql } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { getRedis } from "../../../redis.js";
import { users, rechargeOrders, withdrawOrders } from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";

export async function todoQueueRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/dashboard/todo-queue", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const redis = getRedis();

    try {
      const cached = await redis.get("dashboard:todo-queue");
      if (cached) return reply.send(JSON.parse(cached));
    } catch {}

    const db = getDb();
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 86400000);

    // 1. 实名待审
    const [pendingRealName] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.realNameStatus, "pending_review"));

    // 2. 对公转账待审
    const [bankTransferPending] = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${rechargeOrders.amount}::numeric), 0)`,
      })
      .from(rechargeOrders)
      .where(
        and(
          eq(rechargeOrders.status, "pending"),
          eq(rechargeOrders.channel, "bank_transfer"),
          gte(rechargeOrders.createdAt, threeDaysAgo)
        )
      );

    // 3. 对公转账待一审
    const [firstReviewBank] = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${rechargeOrders.amount}::numeric), 0)`,
      })
      .from(rechargeOrders)
      .where(
        and(
          eq(rechargeOrders.channel, "bank_transfer"),
          sql`${rechargeOrders.status} IN ('pending', 'paid')`,
          sql`${rechargeOrders.firstConfirmedBy} IS NULL`
        )
      );

    // 4. 对公转账待二审
    const [secondReviewBank] = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${rechargeOrders.amount}::numeric), 0)`,
      })
      .from(rechargeOrders)
      .where(
        and(
          eq(rechargeOrders.channel, "bank_transfer"),
          sql`${rechargeOrders.firstConfirmedBy} IS NOT NULL`,
          sql`${rechargeOrders.secondConfirmedBy} IS NULL`
        )
      );

    // 5. 提现待一审
    const [withdrawFirst] = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${withdrawOrders.amount}::numeric), 0)`,
      })
      .from(withdrawOrders)
      .where(eq(withdrawOrders.status, "pending_first_review"));

    // 6. 提现待二审
    const [withdrawSecond] = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${withdrawOrders.amount}::numeric), 0)`,
      })
      .from(withdrawOrders)
      .where(eq(withdrawOrders.status, "pending_second_review"));

    // 7. 未确认的高风险安全事件
    let securityEventCount = 0;
    try {
      const { getUnacknowledgedHighRiskCount } = await import("../../../services/security-event.js");
      securityEventCount = await getUnacknowledgedHighRiskCount();
    } catch {}

    const result = {
      code: 0,
      data: {
        realNamePending: pendingRealName.count,
        bankTransfer: {
          pending: { count: bankTransferPending.count, totalAmount: bankTransferPending.total },
          needFirstReview: { count: firstReviewBank.count, totalAmount: firstReviewBank.total },
          needSecondReview: { count: secondReviewBank.count, totalAmount: secondReviewBank.total },
        },
        withdraws: {
          needFirstReview: { count: withdrawFirst.count, totalAmount: withdrawFirst.total },
          needSecondReview: { count: withdrawSecond.count, totalAmount: withdrawSecond.total },
        },
        unacknowledgedSecurityEvents: securityEventCount,
      },
      message: "ok",
    };

    redis.setex("dashboard:todo-queue", 60, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });
}
