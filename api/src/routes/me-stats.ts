import type { FastifyInstance } from "fastify";
import { and, eq, sql, gte, lt, desc } from "drizzle-orm";
import { db } from "../db/index";
import { billingLogs } from "../db/schema/billing";
import { callLogs } from "../db/schema/call-logs";
import { users } from "../db/schema/users";
import { apiKeys } from "../db/schema/api-keys";

/**
 * §22.2 Dashboard 增强 - 统计相关 API
 * 对应 docs/SPEC-§22-用户端体验增强.md §22.2
 */

export function meStatsRoutes(app: FastifyInstance) {
  // 22.2.1 成本预测
  app.get("/me/stats/forecast", async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    try {
      const [monthResult] = await db
        .select({ cost: sql`COALESCE(SUM(${billingLogs.actualCost}), 0)`.mapWith(Number) })
        .from(billingLogs)
        .where(and(eq(billingLogs.userId, userId), gte(billingLogs.createdAt, startOfMonth), lt(billingLogs.createdAt, now)));

      const [prevMonthResult] = await db
        .select({ cost: sql`COALESCE(SUM(${billingLogs.actualCost}), 0)`.mapWith(Number) })
        .from(billingLogs)
        .where(and(eq(billingLogs.userId, userId), gte(billingLogs.createdAt, startOfPrevMonth), lt(billingLogs.createdAt, endOfPrevMonth)));

      const [avgResult] = await db
        .select({ avg: sql`COALESCE(SUM(${billingLogs.actualCost}), 0) / 30.0`.mapWith(Number) })
        .from(billingLogs)
        .where(and(eq(billingLogs.userId, userId), gte(billingLogs.createdAt, thirtyDaysAgo)));

      const [user] = await db.select({ balance: users.balance }).from(users).where(eq(users.id, userId)).limit(1);

      const currentMonthSpent = Number(monthResult?.cost ?? 0);
      const prevMonthSpent = Number(prevMonthResult?.cost ?? 0);
      const dailyAvg = Number(avgResult?.avg ?? 0);
      const balance = (user?.balance ?? 0) / 100;
      const daysLeft = Math.max(0, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate());
      const forecastTotal = currentMonthSpent + dailyAvg * Math.max(daysLeft, 1);
      const balanceRunoutDays = dailyAvg > 0 ? Math.floor(balance / dailyAvg) : 999;
      const momChange = prevMonthSpent > 0 ? ((currentMonthSpent - prevMonthSpent) / prevMonthSpent) * 100 : 0;
      const momTrend = Math.abs(momChange) < 5 ? "flat" : momChange > 0 ? "up" : "down";

      return {
        code: 0,
        data: {
          currentMonthSpent: Math.round(currentMonthSpent * 100) / 100,
          forecastTotal: Math.round(forecastTotal * 100) / 100,
          dailyAvgCost: Math.round(dailyAvg * 10000) / 10000,
          balance,
          balanceRunoutDays,
          monthOverMonthChange: Math.round(momChange * 10) / 10,
          monthOverMonthTrend: momTrend,
        },
        message: "ok",
      };
    } catch (err) {
      return reply.code(500).send({ code: 500, error: "FORECAST_ERROR", message: "成本预测查询失败" });
    }
  });

  // 22.2.4 实时活动流
  app.get("/me/logs/recent", async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const query = req.query as { limit?: string; since?: string };
    const limit = Math.min(parseInt(query.limit ?? "20"), 50);

    try {
      const where = eq(callLogs.userId, userId);
      const rows = await db
        .select({
          id: callLogs.id,
          requestId: callLogs.requestId,
          modelId: callLogs.modelId,
          vendorId: callLogs.vendorId,
          provider: callLogs.provider,
          requestTokens: callLogs.requestTokens,
          responseTokens: callLogs.responseTokens,
          totalTokens: callLogs.totalTokens,
          costCents: callLogs.costCents,
          status: callLogs.status,
          latencyMs: callLogs.latencyMs,
          createdAt: callLogs.createdAt,
        })
        .from(callLogs)
        .where(where)
        .orderBy(desc(callLogs.id))
        .limit(limit);

      return { code: 0, data: rows, message: "ok" };
    } catch (err) {
      return reply.code(500).send({ code: 500, error: "LOGS_ERROR", message: "查询失败" });
    }
  });

  // 22.2.2 用户级告警（简化版：从余额/summary 实时计算）
  app.get("/me/alerts/summary", async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 86400000);

    try {
      const [user] = await db.select({ balance: users.balance }).from(users).where(eq(users.id, userId)).limit(1);
      const balance = (user?.balance ?? 0) / 100;

      // 24h 失败率
      const [failResult] = await db
        .select({
          total: sql`COUNT(*)`.mapWith(Number),
          fails: sql`SUM(CASE WHEN ${callLogs.status} != 'success' THEN 1 ELSE 0 END)`.mapWith(Number),
        })
        .from(callLogs)
        .where(and(eq(callLogs.userId, userId), gte(callLogs.createdAt, oneDayAgo)));

      const totalCalls = Number(failResult?.total ?? 0);
      const failedCalls = Number(failResult?.fails ?? 0);
      const failRate = totalCalls > 0 ? (failedCalls / totalCalls) * 100 : 0;

      const alerts: any[] = [];
      if (balance < 10) alerts.push({ type: "low_balance", severity: "warning", message: `余额不足 (¥${balance.toFixed(2)})`, value: balance });
      if (failRate > 5) alerts.push({ type: "rate_spike", severity: "critical", message: `24h 失败率 ${failRate.toFixed(1)}%`, value: failRate });

      return { code: 0, data: alerts, message: "ok" };
    } catch (err) {
      return reply.code(500).send({ code: 500, error: "ALERTS_ERROR", message: "告警查询失败" });
    }
  });
}
