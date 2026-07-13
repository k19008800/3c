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
export async function buildTopConsumers(db: any, _redis: Redis): Promise<TopConsumersResult> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

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

  return {
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
}
