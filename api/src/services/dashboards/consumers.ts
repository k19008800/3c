// ============================================================
//  3cloud (3C) — Dashboard Top Consumers Service
//  GET /api/v1/admin/dashboard/top-consumers — 消费排行
// ============================================================

import { eq, and, gte, sql, inArray } from "drizzle-orm";
import type { Redis } from "ioredis";
import { users, callLogs } from "../../db/schema.js";

export interface TopConsumersResult {
  code: number;
  data: {
    topConsumers: Array<{
      userId: number; email: string; nickname: string | null; userType: string;
      companyName: string | null; totalConsumption: string; totalCalls: number;
      monthConsumption: string; balance: string;
    }>;
    lowBalanceUsers: Array<{
      id: number; email: string; nickname: string | null; companyName: string | null;
      balance: string; userType: string;
    }>;
    lowBalanceCount: number;
  };
  message: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildTopConsumers(db: any, redis: Redis): Promise<TopConsumersResult> {
  // PERF: Check Redis cache first
  try {
    const cached = await redis.get("service:dashboard:top-consumers");
    if (cached) return JSON.parse(cached);
  } catch {}

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // PERF: 增加 90 天时间范围过滤，避免全表扫描
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000);

  // PERF: topConsumers 全表无时间过滤 → 增加 90 天 WHERE 条件
  const topConsumers = await db
    .select({
      userId: callLogs.userId,
      totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
      totalCalls: sql<number>`count(*)::int`,
    })
    .from(callLogs)
    .where(gte(callLogs.createdAt, ninetyDaysAgo)) // PERF: 限制最近 90 天数据
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
    .where(gte(callLogs.createdAt, monthStart)) // PERF: 当月数据已有时间范围
    .groupBy(callLogs.userId);

  const monthCostMap = new Map<any, any>(monthTopConsumers.map((r: any) => [r.userId, r]));
  const userIds = topConsumers.map((r: any) => r.userId);
  const consumerUsers = userIds.length > 0
    ? await db
      .select({
        id: users.id, email: users.email, nickname: users.nickname, userType: users.userType,
        balance: users.balance, status: users.status, companyName: users.companyName,
      })
      .from(users)
      .where(inArray(users.id, userIds))
    : [];

  const userMap = new Map<any, any>(consumerUsers.map((u: any) => [u.id, u]));

  const lowBalanceList = await db
    .select({
      id: users.id, email: users.email, nickname: users.nickname, companyName: users.companyName,
      balance: users.balance, userType: users.userType, realNameStatus: users.realNameStatus,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(and(sql`${users.balance}::numeric < 10`, sql`${users.deletedAt} IS NULL`, eq(users.status, "active")))
    .orderBy(sql`${users.balance}::numeric asc`)
    .limit(10);

  const result: TopConsumersResult = {
    code: 0,
    data: {
      topConsumers: topConsumers.map((r: any) => {
        const u = userMap.get(r.userId);
        const m = monthCostMap.get(r.userId);
        return {
          userId: r.userId, email: u?.email ?? "unknown", nickname: u?.nickname ?? null,
          userType: u?.userType ?? "personal", companyName: u?.companyName ?? null,
          totalConsumption: r.totalCost, totalCalls: r.totalCalls,
          monthConsumption: m?.totalCost ?? "0", balance: u?.balance ?? "0",
        };
      }),
      lowBalanceUsers: lowBalanceList.map((u: any) => ({
        id: u.id, email: u.email, nickname: u.nickname, companyName: u.companyName,
        balance: u.balance, userType: u.userType,
      })),
      lowBalanceCount: lowBalanceList.length,
    },
    message: "ok",
  };

  // PERF: Cache with 120s TTL
  redis.setex("service:dashboard:top-consumers", 120, JSON.stringify(result)).catch(() => {});

  return result;
}

// PERF SUGGESTION: 建议创建 daily_user_consumption 物化汇总表以加速消费排行查询
// CREATE MATERIALIZED VIEW daily_user_consumption AS
// SELECT
//   user_id,
//   date_trunc('day', created_at) AS day,
//   count(*)::int AS call_count,
//   sum(cost::numeric) AS total_cost,
//   sum(total_tokens)::bigint AS total_tokens
// FROM call_logs
// WHERE created_at >= NOW() - INTERVAL '90 days'
// GROUP BY user_id, date_trunc('day', created_at)
// WITH DATA;
// 然后定时刷新 (REFRESH MATERIALIZED VIEW CONCURRENTLY daily_user_consumption)
// 查询时改为：SELECT user_id, sum(call_count), sum(total_cost) FROM daily_user_consumption
// WHERE day >= NOW() - INTERVAL '90 days' GROUP BY user_id ORDER BY sum(total_cost) DESC LIMIT 20;
