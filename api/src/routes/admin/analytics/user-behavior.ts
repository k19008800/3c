/**
 * 用户行为分析
 * GET /api/v1/admin/analytics/user-behavior/overview
 * GET /api/v1/admin/analytics/user-behavior/:userId
 */
import { Router, Request, Response } from 'express';
import { db } from '@/db';
import { operationLogs, callLogs } from '@/db/schema';
import { and, gte, lte, eq, sql, desc, count } from 'drizzle-orm';
import { authMiddleware, requirePerm } from '@/middleware/auth';

const router = Router();

router.get('/user-behavior/overview', authMiddleware, requirePerm('analytics:view'), async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const since = new Date(Date.now() - days * 86400000);

    // 活跃用户数
    const activeUsers = await db.select({ val: sql`COUNT(DISTINCT user_id)` })
      .from(operationLogs)
      .where(gte(operationLogs.createdAt, since));

    // 操作频率
    const freq = await db.select({ val: sql`COUNT(*) / NULLIF(COUNT(DISTINCT user_id), 0)` })
      .from(operationLogs)
      .where(gte(operationLogs.createdAt, since));

    // 操作类型分布
    const typeDist = await db.select({
      action: operationLogs.action,
      count: count(),
    })
      .from(operationLogs)
      .where(gte(operationLogs.createdAt, since))
      .groupBy(operationLogs.action)
      .orderBy(desc(count()))
      .limit(20);

    res.json({
      code: 0,
      data: {
        activeUsers: Number(activeUsers[0]?.val || 0),
        avgFrequency: Math.round(Number(freq[0]?.val || 0)),
        periodDays: days,
        typeDistribution: typeDist,
      },
    });
  } catch (err) {
    console.error('[UserBehavior] Overview Error:', err);
    res.status(500).json({ code: -1, message: '分析失败' });
  }
});

router.get('/user-behavior/:userId', authMiddleware, requirePerm('analytics:view'), async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);
    const days = parseInt(req.query.days as string) || 30;
    const since = new Date(Date.now() - days * 86400000);

    const ops = await db.select({
      action: operationLogs.action,
      count: count(),
    })
      .from(operationLogs)
      .where(and(eq(operationLogs.userId, userId), gte(operationLogs.createdAt, since)))
      .groupBy(operationLogs.action)
      .orderBy(desc(count()));

    const hourly = await db.select({
      hour: sql`EXTRACT(HOUR FROM created_at)` as any,
      count: count(),
    })
      .from(operationLogs)
      .where(and(eq(operationLogs.userId, userId), gte(operationLogs.createdAt, since)))
      .groupBy(sql`EXTRACT(HOUR FROM created_at)`)
      .orderBy(sql`EXTRACT(HOUR FROM created_at)`);

    // IP 变化
    const ipCount = await db.select({ val: sql`COUNT(DISTINCT ip)` })
      .from(operationLogs)
      .where(and(eq(operationLogs.userId, userId), gte(operationLogs.createdAt, since)));

    res.json({
      code: 0,
      data: {
        userId,
        periodDays: days,
        totalOperations: ops.reduce((s, o) => s + Number(o.count), 0),
        commonActions: ops,
        activeHours: hourly.map(h => ({ hour: Number(h.hour), count: Number(h.count) })),
        ipVariety: Number(ipCount[0]?.val || 0),
      },
    });
  } catch (err) {
    console.error('[UserBehavior] Detail Error:', err);
    res.status(500).json({ code: -1, message: '分析失败' });
  }
});

export default router;
