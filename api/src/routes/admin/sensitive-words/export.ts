import { Router } from 'express';
import { db } from '@/db';
import { sensitiveWords } from '@/db/schema';
import { authMiddleware, requirePerm } from '@/middleware/auth';

export default function sensitiveWordExportRoutes() {
  const router = Router();

  // GET /api/v1/admin/sensitive-words/export
  router.get('/export', authMiddleware, requirePerm('sensitive_words:export'), async (req, res) => {
    try {
      const format = (req.query.format as string) || 'csv';
      const words = await db.select().from(sensitiveWords).orderBy(sensitiveWords.category);

      const filename = `sensitive-words-${new Date().toISOString().slice(0, 10)}`;

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
        return res.json({ code: 0, data: words });
      }

      // CSV format
      const headers = ['id', 'name', 'category', 'description', 'enabled', 'createdAt'];
      const csvRows = [headers.join(',')];

      for (const w of words) {
        const row = [
          w.id,
          `"${(w.name || '').replace(/"/g, '""')}"`,
          `"${(w.category || '').replace(/"/g, '""')}"`,
          `"${((w.description || '') as string).replace(/"/g, '""')}"`,
          w.enabled ? 'true' : 'false',
          w.createdAt ? new Date(w.createdAt).toISOString() : '',
        ];
        csvRows.push(row.join(','));
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      // BOM for Excel UTF-8
      res.send('\uFEFF' + csvRows.join('\n'));
    } catch (err) {
      console.error('[SensitiveWordExport] 导出失败:', err);
      return res.status(500).json({ code: 1, message: '导出失败' });
    }
  });

  return router;
}
