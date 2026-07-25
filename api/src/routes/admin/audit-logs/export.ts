/**
 * 管理员导出审计日志
 * GET /api/v1/admin/audit-logs/export
 */
import { Router, Request, Response } from 'express';
import { db } from '@/db';
import { operationLogs } from '@/db/schema';
import { and, gte, lte, eq, desc, sql } from 'drizzle-orm';
import { authMiddleware, requirePerm } from '@/middleware/auth';

const router = Router();

router.get(
  '/',
  authMiddleware,
  requirePerm('audit:export'),
  async (req: Request, res: Response) => {
    try {
      const { format = 'csv', from, to, action, userId } = req.query;
      const fromDate = from ? new Date(from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const toDate = to ? new Date(to as string) : new Date();

      const conditions = [
        gte(operationLogs.createdAt, fromDate),
        lte(operationLogs.createdAt, toDate),
      ];
      if (action) conditions.push(eq(operationLogs.action, action as string));
      if (userId) conditions.push(eq(operationLogs.userId, parseInt(userId as string)));

      const rows = await db.select({
        timestamp: operationLogs.createdAt,
        userId: operationLogs.userId,
        action: operationLogs.action,
        category: operationLogs.category,
        ip: operationLogs.ip,
        summary: operationLogs.summary,
        errorReason: operationLogs.errorReason,
      })
        .from(operationLogs)
        .where(and(...conditions))
        .orderBy(desc(operationLogs.createdAt))
        .limit(10000);

      const filename = `audit-logs-${fromDate.toISOString().slice(0, 10)}-${toDate.toISOString().slice(0, 10)}`;

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
        return res.json(rows);
      }

      // CSV
      const headers = ['timestamp', 'userId', 'action', 'category', 'ip', 'summary', 'errorReason'];
      const csvRows = rows.map(r => [
        r.timestamp?.toISOString() || '',
        r.userId?.toString() || '',
        r.action || '',
        r.category || '',
        r.ip || '',
        (r.summary || '').replace(/"/g, '""'),
        (r.errorReason || '').replace(/"/g, '""'),
      ]);

      const csv = [
        headers.join(','),
        ...csvRows.map(r => r.map(v => `"${v}"`).join(',')),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.send('\uFEFF' + csv); // BOM for Excel
    } catch (err) {
      console.error('[AuditLogsExport] Error:', err);
      res.status(500).json({ code: -1, message: '导出失败' });
    }
  }
);

export default router;
