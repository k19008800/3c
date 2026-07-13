// ============================================================
//  3cloud (3C) — Dashboard Stats Service
//  GET /api/v1/admin/dashboard/stats — 今天和昨日统计
// ============================================================

import { eq, and, gte, lt, sql } from "drizzle-orm";
import type { Redis } from "ioredis";
import { users, callLogs, rechargeOrders, vendors, vendorModels, models, agents, agents as agentsTable, balanceLogs, securityEvents, withdrawOrders } from "../../db/schema.js";

export interface StatsResult {
  code: number;
  data: {
    users: { total: number; todayNew: number; yesterdayNew: number };
    calls: {
      today: { total: number; success: number; failed: number; timeout: number; totalTokens: number; totalCost: string; avgDuration: number };
      yesterday: { total: number; success: number; totalTokens: number; totalCost: string };
    };
    revenue: { todayRecharge: string; todayRechargeCount: number; pendingRecharge: string; pendingRechargeCount: number };
    pendingRealName: number;
    topModels: Array<{ modelName: string | null; total: number; totalTokens: number }>;
    security: { unacknowledgedHighRisk: number; activeCircuits: number; bannedIps: number; bannedUsers: number };
    realNameFunnel: Record<string, number>;
    agents: { total: number; active: number; totalCommission: string; pendingWithdraw: string };
    system: { activeVendors: number; downVendors: number };
    yesterdayDau: number;
    lowBalanceUsers: number;
    todayAvgDuration: number;
    todayErrorRate: number;
    platformBalance: string;
  };
  message: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildStats(db: any, _redis: Redis): Promise<StatsResult> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);

  // 1. 用户统计
  const [totalUsers] = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(sql`${users.deletedAt} IS NULL`);
  const [todayNewUsers] = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(and(gte(users.createdAt, todayStart), lt(users.createdAt, todayEnd), sql`${users.deletedAt} IS NULL`));
  const [yesterdayNewUsers] = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(and(gte(users.createdAt, yesterdayStart), lt(users.createdAt, todayStart), sql`${users.deletedAt} IS NULL`));

  // 2. 调用统计
  const todayCalls = await db.select({
    total: sql<number>`count(*)::int`,
    success: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
    failed: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
    timedout: sql<number>`count(*) filter (where ${callLogs.status} = 'timeout')::int`,
    totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
    totalCost: sql<string>`coalesce(sum(${callLogs.cost}), '0')`,
    totalDuration: sql<number>`coalesce(sum(${callLogs.durationMs}), 0)::bigint`,
  }).from(callLogs).where(and(gte(callLogs.createdAt, todayStart), lt(callLogs.createdAt, todayEnd)));

  const yesterdayCalls = await db.select({
    total: sql<number>`count(*)::int`,
    success: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
    totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
    totalCost: sql<string>`coalesce(sum(${callLogs.cost}), '0')`,
  }).from(callLogs).where(and(gte(callLogs.createdAt, yesterdayStart), lt(callLogs.createdAt, todayStart)));

  // 3. 充值统计
  const [todayRecharge] = await db.select({ count: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(${rechargeOrders.amount}), '0')` }).from(rechargeOrders).where(and(gte(rechargeOrders.createdAt, todayStart), lt(rechargeOrders.createdAt, todayEnd), eq(rechargeOrders.status, "paid")));
  const [pendingRecharge] = await db.select({ count: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(${rechargeOrders.amount}), '0')` }).from(rechargeOrders).where(eq(rechargeOrders.status, "pending"));

  // 4. 实名审核待办
  const [pendingRealName] = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.realNameStatus, "pending_review"));

  // 5. 模型调用分布（今日 Top 5）
  const topModels = await db.select({ modelName: callLogs.modelName, total: sql<number>`count(*)::int`, totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint` }).from(callLogs).where(and(gte(callLogs.createdAt, todayStart), lt(callLogs.createdAt, todayEnd))).groupBy(callLogs.modelName).orderBy(sql`count(*) desc`).limit(5);

  // 6. 安全统计
  let security = { unacknowledgedHighRisk: 0, activeCircuits: 0, bannedIps: 0, bannedUsers: 0 };
  try {
    const [{ getUnacknowledgedHighRiskCount, getBannedIpCount, getBannedUserCount }, { getActiveCircuitCount }] = await Promise.all([
      import("../security-event.js"),
      import("../circuit-breaker.js"),
    ]);
    const [unack, circuits, ips, bannedUsers] = await Promise.all([
      getUnacknowledgedHighRiskCount(),
      getActiveCircuitCount(),
      getBannedIpCount(),
      getBannedUserCount(),
    ]);
    security = { unacknowledgedHighRisk: unack, activeCircuits: circuits, bannedIps: ips, bannedUsers };
  } catch {
    // 安全统计失败不阻塞主流程
  }

  // 7. 实名漏斗全量
  const realNameFunnel = await db.select({ status: users.realNameStatus, count: sql<number>`count(*)::int` }).from(users).where(sql`${users.deletedAt} IS NULL`).groupBy(users.realNameStatus);

  // 8. 代理商摘要
  const [agentSummary] = await db.select({
    total: sql<number>`count(*)::int`,
    active: sql<number>`count(*) filter (where ${agents.status} = true)::int`,
    totalCommission: sql<string>`coalesce(sum(${agents.totalCommission}::numeric), 0)`,
    pendingWithdraw: sql<string>`coalesce(sum(${agents.pendingWithdraw}::numeric), 0)`,
  }).from(agents);

  // 9. 系统运行指标
  const [systemMetrics] = await db.select({
    activeVendors: sql<number>`count(*) filter (where ${vendors.status} = 'active')::int`,
    downVendors: sql<number>`count(*) filter (where ${vendors.status} = 'down')::int`,
  }).from(vendors);

  // 10. 昨日活跃用户数
  const [dauYesterday] = await db.select({ count: sql<number>`count(distinct ${callLogs.userId})::int` }).from(callLogs).where(and(gte(callLogs.createdAt, yesterdayStart), lt(callLogs.createdAt, todayStart)));

  // 11. 低余额用户
  const [lowBalanceUsers] = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(and(sql`${users.balance}::numeric < 10`, sql`${users.deletedAt} IS NULL`, eq(users.status, "active")));

  // 12. 今日平均响应时长
  const todayAvgDuration = todayCalls[0].total > 0 ? Math.round(todayCalls[0].totalDuration / todayCalls[0].total) : 0;

  // 13. 今日失败率
  const todayErrorRate = todayCalls[0].total > 0 ? Number((((todayCalls[0].failed + todayCalls[0].timedout) / todayCalls[0].total) * 100).toFixed(2)) : 0;

  // 14. 平台总余额
  const [platformBalance] = await db.select({ total: sql<string>`coalesce(sum(${users.balance}::numeric), 0)` }).from(users).where(sql`${users.deletedAt} IS NULL`);

  return {
    code: 0,
    data: {
      users: { total: totalUsers.count, todayNew: todayNewUsers.count, yesterdayNew: yesterdayNewUsers.count },
      calls: {
        today: {
          total: todayCalls[0].total, success: todayCalls[0].success, failed: todayCalls[0].failed,
          timeout: todayCalls[0].timedout, totalTokens: Number(todayCalls[0].totalTokens),
          totalCost: todayCalls[0].totalCost,
          avgDuration: todayCalls[0].total > 0 ? Math.round(todayCalls[0].totalDuration / todayCalls[0].total) : 0,
        },
        yesterday: {
          total: yesterdayCalls[0].total, success: yesterdayCalls[0].success,
          totalTokens: Number(yesterdayCalls[0].totalTokens), totalCost: yesterdayCalls[0].totalCost,
        },
      },
      revenue: { todayRecharge: todayRecharge.total, todayRechargeCount: todayRecharge.count, pendingRecharge: pendingRecharge.total, pendingRechargeCount: pendingRecharge.count },
      pendingRealName: pendingRealName.count,
      topModels,
      security,
      realNameFunnel: Object.fromEntries(realNameFunnel.map((r: any) => [r.status, r.count])),
      agents: agentSummary,
      system: systemMetrics,
      yesterdayDau: dauYesterday.count,
      lowBalanceUsers: lowBalanceUsers.count,
      todayAvgDuration,
      todayErrorRate,
      platformBalance: platformBalance.total,
    },
    message: "ok",
  };
}
