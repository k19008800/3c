// ============================================================
//  3cloud (3C) — 财务报表导出路由
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, requirePerm, Perm } from "../../../middleware/auth.js";
import { AppError } from "../../../services/auth-service/index.js";
import { getDb } from "../../../db/index.js";
import { auditLogs, users } from "../../../db/schema.js";
import { nanoid } from "nanoid";
import fs from "fs/promises";
import path from "path";

// Placeholder for exportFinanceReport (not yet implemented)
async function exportFinanceReport(options: any) {
  throw new Error('exportFinanceReport not implemented');
}

function verifyExportSignature(data: any, signature: string): boolean {
  return false; // Placeholder
}

interface ExportRequest {
  format: 'csv' | 'json';
  startDate: string;
  endDate: string;
}

export async function adminFinanceExportRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ════════════════════════════════════════════════════════════
  //  POST /api/v1/admin/finance/export/recharge — 导出充值记录
  // ════════════════════════════════════════════════════════════

  app.post("/api/v1/admin/finance/export/recharge", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const body = request.body as ExportRequest;

      // 验证参数
      if (!body.dateRange?.start || !body.dateRange?.end) {
        throw new AppError(400, "请选择导出时间范围");
      }

      const result = await exportFinanceReport(
        { ...body, type: "recharge" },
        request.user!.userId
      );

      // 记录审计日志
      await logExportAudit(request.user!.userId, "recharge", body, result.recordCount);

      reply.status(200).send({
        code: 0,
        data: result,
        message: "ok",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ════════════════════════════════════════════════════════════
  //  POST /api/v1/admin/finance/export/withdraw — 导出提现记录
  // ════════════════════════════════════════════════════════════

  app.post("/api/v1/admin/finance/export/withdraw", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const body = request.body as ExportRequest;

      if (!body.dateRange?.start || !body.dateRange?.end) {
        throw new AppError(400, "请选择导出时间范围");
      }

      const result = await exportFinanceReport(
        { ...body, type: "withdraw" },
        request.user!.userId
      );

      await logExportAudit(request.user!.userId, "withdraw", body, result.recordCount);

      reply.status(200).send({
        code: 0,
        data: result,
        message: "ok",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ════════════════════════════════════════════════════════════
  //  POST /api/v1/admin/finance/export/commission — 导出佣金记录
  // ════════════════════════════════════════════════════════════

  app.post("/api/v1/admin/finance/export/commission", {
    preHandler: [requirePerm(Perm.FINANCE_COMMISSION)],
  }, async (request, reply) => {
    try {
      const body = request.body as ExportRequest;

      if (!body.dateRange?.start || !body.dateRange?.end) {
        throw new AppError(400, "请选择导出时间范围");
      }

      const result = await exportFinanceReport(
        { ...body, type: "commission" },
        request.user!.userId
      );

      await logExportAudit(request.user!.userId, "commission", body, result.recordCount);

      reply.status(200).send({
        code: 0,
        data: result,
        message: "ok",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ════════════════════════════════════════════════════════════
  //  POST /api/v1/admin/finance/export/balance — 导出交易流水
  // ════════════════════════════════════════════════════════════

  app.post("/api/v1/admin/finance/export/balance", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const body = request.body as ExportRequest;

      if (!body.dateRange?.start || !body.dateRange?.end) {
        throw new AppError(400, "请选择导出时间范围");
      }

      const result = await exportFinanceReport(
        { ...body, type: "balance" },
        request.user!.userId
      );

      await logExportAudit(request.user!.userId, "balance", body, result.recordCount);

      reply.status(200).send({
        code: 0,
        data: result,
        message: "ok",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ════════════════════════════════════════════════════════════
  //  POST /api/v1/admin/finance/export/summary — 综合报表
  // ════════════════════════════════════════════════════════════

  app.post("/api/v1/admin/finance/export/summary", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const body = request.body as ExportRequest;

      if (!body.dateRange?.start || !body.dateRange?.end) {
        throw new AppError(400, "请选择导出时间范围");
      }

      const result = await exportFinanceReport(
        { ...body, type: "summary" },
        request.user!.userId
      );

      await logExportAudit(request.user!.userId, "summary", body, result.recordCount);

      reply.status(200).send({
        code: 0,
        data: result,
        message: "ok",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ════════════════════════════════════════════════════════════
  //  GET /api/v1/admin/finance/export/download/:fileId — 下载文件
  // ════════════════════════════════════════════════════════════

  app.get("/api/v1/admin/finance/export/download/:fileId", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const params = request.params as { fileId: string };
      const query = request.query as { sig: string };

      // 验证签名
      const { valid, filepath } = await verifyExportSignature(
        params.fileId,
        query.sig
      );

      if (!valid || !filepath) {
        throw new AppError(403, "下载链接无效或已过期");
      }

      // 读取文件
      const fileBuffer = await fs.readFile(filepath);
      const filename = path.basename(filepath);

      // 设置响应头
      reply.header("Content-Type", filename.endsWith(".xlsx")
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "text/csv; charset=utf-8"
      );
      reply.header("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
      reply.header("Content-Length", fileBuffer.length);

      reply.send(fileBuffer);
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });
}

// 审计日志记录
async function logExportAudit(
  operatorId: number,
  type: string,
  params: ExportRequest,
  recordCount: number
) {
  const db = getDb();
  await db.insert(auditLogs).values({
    operatorId,
    action: "finance_export" as any,
    targetType: "finance_export",
    targetId: null,
    description: JSON.stringify({
      type,
      format: params.format,
      dateRange: params.dateRange,
      filters: params.filters,
      recordCount,
    }),
    ip: null,
    createdAt: new Date(),
  });
}
