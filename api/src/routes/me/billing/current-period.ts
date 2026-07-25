// ============================================================
//  3cloud (3C) — 用户账单周期概览路由
//  GET /api/v1/me/billing/current-period — 当前账单周期概览
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, gte, lt, sql, desc } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { callLogs, rechargeOrders, balanceLogs } from "../../../db/schema.js";
import { authenticateJWT } from "../../../middleware/auth.js";

export async function billingCurrentPeriodRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/me/billing/current-period
  //  返回当前账单周期（自然月）的概览数据：
  //    - 周期起止时间
  //    - 已出账金额（上月已结算）
  //    - 待结算金额（本月消费）
  //    - 预估账单（基于当前消费趋势）
  // ──────────────────────────────────────────────

  app.get("/api/v1/me/billing/current-period", async (request, reply) => {
    const userId = request.user!.userId;

    try {
      const now = new Date();
      // 当前账单周期：自然月（本月1日 00:00 ~ 下月1日 00:00）
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      // 上一个账单周期
      const lastPeriodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastPeriodEnd = periodStart;

      const db = getDb();

      // ── 本月消费（待结算金额）──
      const [currentUsage] = await db
        .select({
          totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
          totalCalls: sql<number>`count(*)::int`,
          totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        })
        .from(callLogs)
        .where(
          and(
            eq(callLogs.userId, userId),
            gte(callLogs.createdAt, periodStart),
            lt(callLogs.createdAt, periodEnd)
          )
        );

      // ── 上月消费（已出账金额）──
      const [lastUsage] = await db
        .select({
          totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
          totalCalls: sql<number>`count(*)::int`,
          totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        })
        .from(callLogs)
        .where(
          and(
            eq(callLogs.userId, userId),
            gte(callLogs.createdAt, lastPeriodStart),
            lt(callLogs.createdAt, lastPeriodEnd)
          )
        );

      // ── 本月充值 ──
      const [rechargeResult] = await db
        .select({
          totalRecharge: sql<string>`coalesce(sum(${rechargeOrders.amount}::numeric), 0)`,
          rechargeCount: sql<number>`count(*)::int`,
        })
        .from(rechargeOrders)
        .where(
          and(
            eq(rechargeOrders.userId, userId),
            eq(rechargeOrders.status, "paid"),
            gte(rechargeOrders.paidAt, periodStart),
            lt(rechargeOrders.paidAt, periodEnd)
          )
        );

      // ── 计算预估账单 ──
      // 基于当前消费趋势：如果本月已过 N 天，预估全月消费 = 当前消费 / N * 本月总天数
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const daysPassed = now.getDate();
      const currentCost = Number(currentUsage.totalCost) || 0;
      const lastCost = Number(lastUsage.totalCost) || 0;

      let estimatedCost = currentCost;
      let estimationMethod = "actual";

      if (daysPassed > 0 && daysPassed < daysInMonth) {
        // 按日均消费推算全月
        const dailyAvg = currentCost / daysPassed;
        estimatedCost = dailyAvg * daysInMonth;
        estimationMethod = "daily_average";
      }

      // ── 计算周期进度 ──
      const progressPercent = Math.min(100, (daysPassed / daysInMonth) * 100);

      // ── 最近 7 天消费趋势（用于前端图表）──
      const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
      const dailyTrend = await db
        .select({
          date: sql<string>`${callLogs.createdAt}::date::text`,
          cost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
          calls: sql<number>`count(*)::int`,
        })
        .from(callLogs)
        .where(
          and(
            eq(callLogs.userId, userId),
            gte(callLogs.createdAt, sevenDaysAgo),
            lt(callLogs.createdAt, now)
          )
        )
        .groupBy(sql`${callLogs.createdAt}::date`)
        .orderBy(sql`${callLogs.createdAt}::date asc`);

      // 填充缺失日期
      const trendMap = new Map(dailyTrend.map((r) => [r.date, r]));
      const filledTrend = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dateKey = d.toISOString().slice(0, 10);
        const e = trendMap.get(dateKey);
        filledTrend.push({
          date: dateKey,
          cost: e?.cost ?? "0",
          calls: e?.calls ?? 0,
        });
      }

      // ── 计算日均消费和环比变化 ──
      const currentDailyAvg = daysPassed > 0 ? currentCost / daysPassed : 0;
      const lastDailyAvg = lastCost / daysInMonth; // 上月日均
      const momChange = lastDailyAvg > 0 ? ((currentDailyAvg - lastDailyAvg) / lastDailyAvg) * 100 : 0;

      reply.send({
        code: 0,
        data: {
          // 周期信息
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          daysInMonth,
          daysPassed,
          progressPercent: Number(progressPercent.toFixed(2)),

          // 已出账金额（上月）
          billedAmount: lastCost.toFixed(6),
          billedPeriodStart: lastPeriodStart.toISOString(),
          billedPeriodEnd: lastPeriodEnd.toISOString(),

          // 待结算金额（本月）
          pendingAmount: currentCost.toFixed(6),
          pendingCalls: Number(currentUsage.totalCalls) || 0,
          pendingTokens: Number(currentUsage.totalTokens) || 0,

          // 预估账单
          estimatedAmount: estimatedCost.toFixed(6),
          estimationMethod,
          estimatedDailyAvg: currentDailyAvg.toFixed(6),

          // 充值信息
          totalRecharge: Number(rechargeResult.totalRecharge || 0).toFixed(6),
          rechargeCount: Number(rechargeResult.rechargeCount) || 0,

          // 环比变化
          momChangePercent: Number(momChange.toFixed(2)),

          // 消费趋势
          dailyTrend: filledTrend,
        },
        message: "ok",
      });
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        message: `查询账单周期失败: ${err.message}`,
      });
    }
  });
}
