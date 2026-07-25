// ============================================================
//  3cloud (3C) — 成本预测与预警 API
//  GET /api/v1/me/stats/forecast — 基于最近7日消费趋势预测
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { callLogs, users } from "../../../db/schema.js";
import { authenticateJWT } from "../../../middleware/auth.js";

/**
 * 简单线性回归
 * @param x 自变量数组
 * @param y 因变量数组
 * @returns 斜率和截距
 */
function linearRegression(x: number[], y: number[]): { slope: number; intercept: number } {
  const n = x.length;
  if (n === 0) return { slope: 0, intercept: 0 };

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return { slope: 0, intercept: sumY / n };

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

/**
 * 计算余额耗尽日期
 * @param balance 当前余额
 * @param dailyCost 预测的日均消费
 * @returns 耗尽日期（null 表示不会耗尽）
 */
function calculateDepletionDate(balance: number, dailyCost: number): Date | null {
  if (dailyCost <= 0) return null;
  const daysRemaining = balance / dailyCost;
  if (daysRemaining > 365) return null; // 超过一年视为不会耗尽
  const depletionDate = new Date();
  depletionDate.setDate(depletionDate.getDate() + Math.floor(daysRemaining));
  return depletionDate;
}

export async function meStatsForecastRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/me/stats/forecast — 成本预测与预警
  // ──────────────────────────────────────────────

  app.get("/api/v1/me/stats/forecast", async (request, reply) => {
    const userId = request.user!.userId;

    try {
      const db = getDb();

      // 获取用户余额
      const [user] = await db
        .select({ balance: users.balance })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return reply.status(404).send({
          code: 1,
          message: "用户不存在",
        });
      }

      const balance = Number(user.balance) || 0;

      // 获取最近7日的每日消费数据
      const now = new Date();
      const startDate = new Date(now.getTime() - 7 * 86400000);

      const dailyRows = await db
        .select({
          date: sql<string>`${callLogs.createdAt}::date::text`,
          totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
        })
        .from(callLogs)
        .where(
          and(
            eq(callLogs.userId, userId),
            gte(callLogs.createdAt, startDate),
            lt(callLogs.createdAt, now)
          )
        )
        .groupBy(sql`${callLogs.createdAt}::date`)
        .orderBy(sql`${callLogs.createdAt}::date asc`);

      // 填充缺失的日期（确保7天数据完整）
      const dailyData: { date: string; cost: number }[] = [];
      const dataMap = new Map(dailyRows.map(r => [r.date, Number(r.totalCost)]));

      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dateKey = d.toISOString().slice(0, 10);
        dailyData.push({
          date: dateKey,
          cost: dataMap.get(dateKey) || 0,
        });
      }

      // 计算最近7日总消费和日均消费
      const total7Days = dailyData.reduce((sum, d) => sum + d.cost, 0);
      const avgDailyCost = total7Days / 7;

      // 线性回归预测本月总消费
      const x = dailyData.map((_, i) => i); // 0, 1, 2, ..., 6
      const y = dailyData.map(d => d.cost);
      const { slope, intercept } = linearRegression(x, y);

      // 预测未来消费（本月剩余天数）
      const today = new Date();
      const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const daysRemainingInMonth = lastDayOfMonth.getDate() - today.getDate();

      // 预测本月剩余消费 = Σ(第i天的预测值)，i从7到7+daysRemainingInMonth-1
      let predictedRemainingCost = 0;
      for (let i = 7; i < 7 + daysRemainingInMonth; i++) {
        predictedRemainingCost += Math.max(0, slope * i + intercept);
      }

      // 本月已消费（从月初到今天）
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const [monthUsage] = await db
        .select({
          totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
        })
        .from(callLogs)
        .where(
          and(
            eq(callLogs.userId, userId),
            gte(callLogs.createdAt, monthStart),
            lt(callLogs.createdAt, now)
          )
        );

      const monthToDateCost = Number(monthUsage?.totalCost) || 0;
      const predictedMonthTotal = monthToDateCost + predictedRemainingCost;

      // 计算余额耗尽日期
      const depletionDate = calculateDepletionDate(balance, avgDailyCost);

      // 预警判断
      const warnings: string[] = [];
      let warningLevel: 'none' | 'low' | 'medium' | 'high' = 'none';

      if (balance < avgDailyCost * 3) {
        warnings.push("余额不足3日消费");
        warningLevel = 'high';
      } else if (balance < avgDailyCost * 7) {
        warnings.push("余额不足7日消费");
        warningLevel = 'medium';
      } else if (balance < avgDailyCost * 14) {
        warnings.push("余额不足14日消费");
        warningLevel = 'low';
      }

      if (depletionDate) {
        const daysUntilDepletion = Math.ceil((depletionDate.getTime() - now.getTime()) / 86400000);
        if (daysUntilDepletion <= 3) {
          warnings.push(`余额将在${daysUntilDepletion}天后耗尽`);
          warningLevel = 'high';
        } else if (daysUntilDepletion <= 7) {
          warnings.push(`余额将在${daysUntilDepletion}天后耗尽`);
          if (warningLevel !== 'high') warningLevel = 'medium';
        }
      }

      // 趋势判断
      let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
      if (slope > avgDailyCost * 0.1) {
        trend = 'increasing';
      } else if (slope < -avgDailyCost * 0.1) {
        trend = 'decreasing';
      }

      reply.send({
        code: 0,
        data: {
          // 当前余额
          balance: balance.toFixed(6),

          // 最近7日消费
          last7DaysCost: total7Days.toFixed(6),
          avgDailyCost: avgDailyCost.toFixed(6),

          // 本月预测
          monthToDateCost: monthToDateCost.toFixed(6),
          predictedRemainingCost: predictedRemainingCost.toFixed(6),
          predictedMonthTotal: predictedMonthTotal.toFixed(6),

          // 耗尽日期
          depletionDate: depletionDate ? depletionDate.toISOString() : null,

          // 预警
          warnings,
          warningLevel,

          // 趋势
          trend,

          // 每日数据（用于绘制趋势图）
          dailySeries: dailyData,

          // 回归参数（可选，用于调试）
          regression: {
            slope: slope.toFixed(6),
            intercept: intercept.toFixed(6),
          },
        },
        message: "ok",
      });
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        message: `预测失败: ${err.message}`,
      });
    }
  });
}
