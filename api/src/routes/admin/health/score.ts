import { Router } from 'express';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { authMiddleware } from '@/middleware/auth';

export default function healthScoreRoutes() {
  const router = Router();

  // GET /api/v1/admin/health/score — 系统健康评分
  router.get('/score', authMiddleware, async (_req, res) => {
    try {
      // 维度1: API 可用性 — 过去1小时成功率
      const [apiHealth] = await db.execute(sql`
        SELECT 
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status = 'success')::int as success,
          ROUND((COUNT(*) FILTER (WHERE status = 'success')::numeric / NULLIF(COUNT(*), 0)) * 100, 1) as success_rate
        FROM call_logs 
        WHERE created_at > NOW() - INTERVAL '1 hour'
      `);

      // 维度2: 数据库状态 — 连接数/活跃连接
      const [dbHealth] = await db.execute(sql`
        SELECT 
          (SELECT count(*) FROM pg_stat_activity)::int as total_connections,
          (SELECT count(*) FROM pg_stat_activity WHERE state = 'active')::int as active_connections
      `);

      // 维度3: 响应时间 — 过去1小时平均延迟
      const [latency] = await db.execute(sql`
        SELECT ROUND(COALESCE(AVG(latency_ms), 0), 1) as avg_latency_ms
        FROM call_logs 
        WHERE created_at > NOW() - INTERVAL '1 hour' AND status = 'success'
      `);

      // 维度4: 错误率趋势 — 过去24小时对比
      const [errorTrend] = await db.execute(sql`
        WITH hourly AS (
          SELECT 
            date_trunc('hour', created_at) as hour,
            COUNT(*) FILTER (WHERE status != 'success')::int as errors,
            COUNT(*)::int as total
          FROM call_logs 
          WHERE created_at > NOW() - INTERVAL '24 hours'
          GROUP BY date_trunc('hour', created_at)
        )
        SELECT 
          ROUND(AVG(errors::numeric / NULLIF(total, 0)) * 100, 1) as avg_error_rate
        FROM hourly
      `);

      // 计算综合评分
      const apiScore = apiHealth?.success_rate ? Math.min(100, parseFloat(apiHealth.success_rate)) : 100;
      const dbConnections = dbHealth?.active_connections || 0;
      const dbScore = dbConnections < 10 ? 100 : Math.max(0, 100 - (dbConnections - 10) * 5);
      const avgLatency = latency?.avg_latency_ms || 0;
      const latencyScore = avgLatency < 500 ? 100 : Math.max(0, 100 - (avgLatency - 500) / 10);
      const errorRate = errorTrend?.avg_error_rate || 0;
      const errorScore = errorRate < 1 ? 100 : Math.max(0, 100 - errorRate * 10);

      const overallScore = Math.round((apiScore + dbScore + latencyScore + errorScore) / 4);

      return res.json({
        code: 0,
        data: {
          overall: overallScore,
          level: overallScore >= 90 ? 'healthy' : overallScore >= 70 ? 'warning' : 'critical',
          dimensions: {
            apiAvailability: { score: Math.round(apiScore), detail: `${apiHealth?.success_rate || 100}% 成功率` },
            databaseHealth: { score: Math.round(dbScore), detail: `${dbConnections} 活跃连接` },
            responseTime: { score: Math.round(latencyScore), detail: `${avgLatency}ms 平均延迟` },
            errorRate: { score: Math.round(errorScore), detail: `${errorRate}% 平均错误率` },
          },
        },
      });
    } catch (err) {
      console.error('[HealthScore] 计算失败:', err);
      return res.status(500).json({ code: 1, message: '计算健康评分失败' });
    }
  });

  return router;
}
