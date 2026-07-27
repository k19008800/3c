// ============================================================
//  3cloud (3C) — 用户端统计对比 API
//  GET /api/v1/me/stats/compare?mode=previous|yoy&days=7|30|90
// ============================================================

import { FastifyInstance } from "fastify";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { callLogs } from "../../../db/schema.js";
import { authenticateJWT } from "../../../middleware/auth.js";

interface PeriodStats {
  calls: number;
  tokens: number;
  cost: number;
  successCount: number;
  failedCount: number;
  avgDurationMs: number;
  successRate: number;
}

interface ChangeInfo {
  calls: string;
  tokens: string;
  cost: string;
  successRate: string;
  avgDurationMs: string;
}

async function getPeriodStats(
  db: ReturnType<typeof getDb>,
  userId: number,
  start: Date,
  end: Date
): Promise<PeriodStats> {
  const [row] = await db
    .select({
      calls: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::int`,
      cost: sql<number>`coalesce(sum(${callLogs.cost}), 0)::numeric(12,6)`,
      successCount: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
      failedCount: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
      avgDurationMs: sql<number>`coalesce(avg(${callLogs.durationMs}), 0)::numeric(12,2)`,
    })
    .from(callLogs)
    .where(
      and(
        eq(callLogs.userId, userId),
        gte(callLogs.createdAt, start),
        lt(callLogs.createdAt, end)
      )
    );

  return {
    calls: row?.calls ?? 0,
    tokens: row?.tokens ?? 0,
    cost: parseFloat(String(row?.cost ?? 0)),
    successCount: row?.successCount ?? 0,
    failedCount: row?.failedCount ?? 0,
    avgDurationMs: parseFloat(String(row?.avgDurationMs ?? 0)),
    successRate: row && row.calls > 0 ? (row.successCount / row.calls) * 100 : 100,
  };
}

function calcPctChange(current: number, previous: number): string {
  if (previous === 0 && current === 0) return "0%";
  if (previous === 0) return "+∞";
  const diff = ((current - previous) / previous) * 100;
  const sign = diff > 0 ? "+" : "";
  return `${sign}${diff.toFixed(1)}%`;
}

function computeChanges(current: PeriodStats, previous: PeriodStats): ChangeInfo {
  return {
    calls: calcPctChange(current.calls, previous.calls),
    tokens: calcPctChange(current.tokens, previous.tokens),
    cost: calcPctChange(current.cost, previous.cost),
    successRate: calcPctChange(current.successRate, previous.successRate),
    avgDurationMs: calcPctChange(current.avgDurationMs, previous.avgDurationMs),
  };
}

export async function meStatsCompareRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  app.get("/api/v1/me/stats/compare", async (request, reply) => {
    const db = getDb();
    const userId = request.user!.userId;
    const query = request.query as { mode?: string; days?: string };

    const mode = query.mode === "yoy" ? "yoy" : "previous";
    const days = Math.min(90, Math.max(1, parseInt(query.days ?? "7", 10) || 7));

    const now = new Date();

    // 当前周期：最近 days 天
    const currentEnd = now;
    const currentStart = new Date(now.getTime() - days * 86400000);

    let previousStart: Date;
    let previousEnd: Date;

    if (mode === "previous") {
      // 环比：前一个 days 天
      previousEnd = currentStart;
      previousStart = new Date(previousEnd.getTime() - days * 86400000);
    } else {
      // 同比：去年同期
      previousStart = new Date(currentStart.getTime() - 365 * 86400000);
      previousEnd = new Date(currentEnd.getTime() - 365 * 86400000);
    }

    const [currentStats, previousStats] = await Promise.all([
      getPeriodStats(db, userId, currentStart, currentEnd),
      getPeriodStats(db, userId, previousStart, previousEnd),
    ]);

    reply.status(200).send({
      code: 0,
      data: {
        mode,
        days,
        currentPeriod: {
          start: currentStart.toISOString(),
          end: currentEnd.toISOString(),
          stats: currentStats,
        },
        previousPeriod: {
          start: previousStart.toISOString(),
          end: previousEnd.toISOString(),
          stats: previousStats,
        },
        changes: computeChanges(currentStats, previousStats),
      },
      message: "ok",
    });
  });
}
