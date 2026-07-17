// ============================================================
//  3cloud (3C) — 财务仪表盘
// ============================================================

import { eq, and, sql, gte } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  withdrawOrders,
  rechargeOrders,
  commissionLogs,
} from "../../db/schema.js";
import { getRedis } from "../../redis.js";

/**
 * 财务仪表盘概览
 * Redis 缓存 60s TTL，降级到 DB 查询
 */
export async function getFinanceDashboard() {
  const db = getDb();
  const redis = getRedis();

  // 缓存命中直接返回（60秒 TTL）
  const cacheKey = "finance:dashboard";
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Redis 不可用时降级到 DB 查询
  }

  // 待初审提现
  const [firstReviewResult] = await db
    .select({
      count: sql<number>`count(*)`,
      sum: sql<string>`coalesce(sum(${withdrawOrders.amount}), '0.000000')`,
    })
    .from(withdrawOrders)
    .where(eq(withdrawOrders.status, "pending_first_review"));

  // 待复审提现
  const [secondReviewResult] = await db
    .select({
      count: sql<number>`count(*)`,
      sum: sql<string>`coalesce(sum(${withdrawOrders.amount}), '0.000000')`,
    })
    .from(withdrawOrders)
    .where(eq(withdrawOrders.status, "pending_second_review"));

  // 待确认充值（对公转账待双审）
  const [pendingRechargeResult] = await db
    .select({
      count: sql<number>`count(*)`,
      sum: sql<string>`coalesce(sum(${rechargeOrders.amount}), '0.000000')`,
    })
    .from(rechargeOrders)
    .where(and(
      eq(rechargeOrders.status, "pending"),
      eq(rechargeOrders.channel, "bank_transfer"),
    ));

  // 今日交易统计
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [todayWithdrawPaidResult] = await db
    .select({
      count: sql<number>`count(*)`,
      sum: sql<string>`coalesce(sum(${withdrawOrders.actualAmount}), '0.000000')`,
    })
    .from(withdrawOrders)
    .where(and(
      eq(withdrawOrders.status, "paid"),
      gte(withdrawOrders.paidAt, todayStart),
    ));

  // 待结算佣金统计
  const [pendingCommissionResult] = await db
    .select({
      count: sql<number>`count(*)`,
      sum: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}), '0.000000')`,
    })
    .from(commissionLogs)
    .where(eq(commissionLogs.status, "pending"));

  const result = {
    pendingFirstReview: {
      count: Number(firstReviewResult?.count ?? 0),
      totalAmount: firstReviewResult?.sum ?? "0.000000",
    },
    pendingSecondReview: {
      count: Number(secondReviewResult?.count ?? 0),
      totalAmount: secondReviewResult?.sum ?? "0.000000",
    },
    pendingRecharge: {
      count: Number(pendingRechargeResult?.count ?? 0),
      totalAmount: pendingRechargeResult?.sum ?? "0.000000",
    },
    pendingCommissions: {
      count: Number(pendingCommissionResult?.count ?? 0),
      totalAmount: pendingCommissionResult?.sum ?? "0.000000",
    },
    todayPaidWithdraws: {
      count: Number(todayWithdrawPaidResult?.count ?? 0),
      totalAmount: todayWithdrawPaidResult?.sum ?? "0.000000",
    },
  };

  // 写缓存（非阻塞）
  redis.setex(cacheKey, 60, JSON.stringify(result)).catch(() => {});

  return result;
}
