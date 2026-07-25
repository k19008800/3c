/**
 * 管理员导出调用日志
 * GET /api/v1/admin/logs/export
 */
import { Router, Request, Response } from 'express';
import { db } from '@/db';
import { callLogs } from '@/db/schema';
import { and, gte, lte, eq, desc } from 'drizzle-orm';
import { authMiddleware, requirePerm } from '@/middleware/auth';

const router = Router();

router.get('/export', authMiddleware, requirePerm('logs:export'), async (req: Request, res: Response) => {
  try {
    const { format = 'csv', from, to, model, status, userId } = req.query;
    const fromDate = from ? new Date(from as string) : new Date(Date.now() - 7 * 86400000);
    const toDate = to ? new Date(to as string) : new Date();

    const conditions = [
      gte(callLogs.createdAt, fromDate),
      lte(callLogs.createdAt, toDate),
    ];
    if (model) conditions.push(eq(callLogs.model, model as string));
    if (status) conditions.push(eq(callLogs.status, status as string));
    if (userId) conditions.push(eq(callLogs.userId, parseInt(userId as string)));

    const rows = await db.select({
      timestamp: callLogs.createdAt,
      userId: callLogs.userId,
      model: callLogs.model,
      status: callLogs.status,
      inputTokens: callLogs.inputTokens,
      outputTokens: callLogs.outputTokens,
      cost: callLogs.cost,
      latencyMs: callLogs.latencyMs,
      keyName: callLogs.keyName,
      ip: callLogs.ip,
    })
      .from(callLogs)
      .where(and(...conditions))
      .orderBy(desc(callLogs.createdAt))
      .limit(50000);

    const filename = `call-logs-${fromDate.toISOString().slice(0, 10)}`;

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
      return res.json(rows);
    }

    const headers = ['timestamp', 'userId', 'model', 'status', 'inputTokens', 'outputTokens', 'cost', 'latencyMs', 'keyName', 'ip'];
    const csvRows = rows.map(r => [
      r.timestamp?.toISOString() || '',
      r.userId?.toString() || '',
      (r.model || '').replace(/"/g, '""'),
      r.status || '',
      r.inputTokens?.toString() || '0',
      r.outputTokens?.toString() || '0',
      r.cost?.toFixed(4) || '0',
      r.latencyMs?.toString() || '0',
      (r.keyName || '').replace(/"/g, '""'),
      r.ip || '',
    ]);

    const csv = [headers.join(','), ...csvRows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (err) {
    console.error('[AdminLogsExport] Error:', err);
    res.status(500).json({ code: -1, message: '导出失败' });
  }
});

export default router;
