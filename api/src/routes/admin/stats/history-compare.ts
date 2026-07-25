/**
 * 历史数据对比分析
 * GET /api/v1/admin/stats/history-compare
 */
import { Router, Request, Response } from 'express';
import { db } from '@/db';
import { callLogs } from '@/db/schema';
import { and, gte, lte, sql } from 'drizzle-orm';
import { authMiddleware, requirePerm } from '@/middleware/auth';

const router = Router();

router.get('/history-compare', authMiddleware, requirePerm('stats:view'), async (req: Request, res: Response) => {
  try {
    const { type = 'calls' } = req.query;
    const p1From = new Date(req.query.period1_from as string || Date.now() - 7 * 86400000);
    const p1To = new Date(req.query.period1_to as string || Date.now());
    const p2From = new Date(req.query.period2_from as string || Date.now() - 14 * 86400000);
    const p2To = new Date(req.query.period2_to as string || Date.now() - 7 * 86400000);

    const aggCol = type === 'tokens' ? sql`COALESCE(SUM(input_tokens + output_tokens), 0)` 
      : type === 'cost' ? sql`COALESCE(SUM(cost), 0)` 
      : sql`COUNT(*)`;

    async function getPeriod(from: Date, to: Date) {
      const rows = await db.select({
        total: sql`${aggCol}`.as('total'),
        avg: sql`${aggCol} / NULLIF(COUNT(DISTINCT DATE(created_at)), 0)`.as('avg'),
      })
        .from(callLogs)
        .where(and(gte(callLogs.createdAt, from), lte(callLogs.createdAt, to)));

      const dailyRows = await db.select({
        day: sql`DATE(created_at)` as any,
        val: aggCol,
      })
        .from(callLogs)
        .where(and(gte(callLogs.createdAt, from), lte(callLogs.createdAt, to)))
        .groupBy(sql`DATE(created_at)`);

      const total = Number(rows[0]?.total || 0);
      const dailyVals = dailyRows.map(r => Number(r.val || 0));
      const avg = dailyVals.length > 0 ? Math.round(total / dailyVals.length) : 0;
      const max = dailyVals.length > 0 ? Math.max(...dailyVals) : 0;

      return { total, avg, max };
    }

    const [period1, period2] = await Promise.all([getPeriod(p1From, p1To), getPeriod(p2From, p2To)]);

    const absChange = period1.total - period2.total;
    const pctChange = period2.total > 0 ? Math.round((absChange / period2.total) * 100) : absChange > 0 ? 100 : -100;
    const trend = absChange > period2.total * 0.1 ? 'up' : absChange < -period2.total * 0.1 ? 'down' : 'stable';

    res.json({
      code: 0,
      data: {
        type,
        period1: { from: p1From, to: p1To, ...period1 },
        period2: { from: p2From, to: p2To, ...period2 },
        change: { absolute: absChange, percentage: pctChange, trend },
      },
    });
  } catch (err) {
    console.error('[HistoryCompare] Error:', err);
    res.status(500).json({ code: -1, message: '对比分析失败' });
  }
});

export default router;
