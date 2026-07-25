// ============================================================
//  3cloud (3C) — 用量数据导出 API
//  GET /api/v1/me/stats/export — 导出 CSV/JSON
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT } from "../../../middleware/auth.js";
import { exportUsageData } from "../../../services/export-service.js";

export async function meStatsExportRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/me/stats/export — 导出用量数据
  //  Query:
  //    format — csv 或 json (默认 csv)
  //    from   — 开始日期 YYYY-MM-DD (默认 7 天前)
  //    to     — 结束日期 YYYY-MM-DD (默认今天)
  // ──────────────────────────────────────────────

  app.get("/api/v1/me/stats/export", async (request, reply) => {
    const userId = request.user!.userId;

    try {
      const query = request.query as {
        format?: string;
        from?: string;
        to?: string;
      };

      // 解析格式
      const format = query.format === 'json' ? 'json' : 'csv';

      // 解析时间范围
      const now = new Date();
      const defaultFrom = new Date(now.getTime() - 7 * 86400000);
      const startDate = query.from ? new Date(query.from) : defaultFrom;
      const endDate = query.to ? new Date(query.to) : now;

      // 验证日期
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return reply.status(400).send({
          code: 1,
          message: "日期格式无效，请使用 YYYY-MM-DD 格式",
        });
      }

      if (startDate >= endDate) {
        return reply.status(400).send({
          code: 1,
          message: "开始日期必须早于结束日期",
        });
      }

      // 限制最大时间范围（防止导出过多数据）
      const maxRangeDays = 365;
      if ((endDate.getTime() - startDate.getTime()) > maxRangeDays * 86400000) {
        return reply.status(400).send({
          code: 1,
          message: `时间范围不能超过 ${maxRangeDays} 天`,
        });
      }

      // 导出数据
      const { content, filename, mimeType } = await exportUsageData({
        userId,
        startDate,
        endDate,
        format,
      });

      // 设置响应头
      reply.header('Content-Type', mimeType);
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      reply.header('Cache-Control', 'no-cache');

      // 返回文件内容
      reply.send(content);
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        message: `导出失败: ${err.message}`,
      });
    }
  });
}
