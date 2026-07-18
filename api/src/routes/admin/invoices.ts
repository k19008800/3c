// ============================================================
//  3cloud (3C) — 发票管理路由（管理员）
//  GET    /api/v1/admin/finance/invoices            — 所有申请
//  GET    /api/v1/admin/finance/invoices/export     — CSV 导出
//  GET    /api/v1/admin/finance/invoices/:id        — 详情
//  POST   /api/v1/admin/finance/invoices/:id/approve — 审核通过
//  POST   /api/v1/admin/finance/invoices/:id/reject  — 拒绝
//  POST   /api/v1/admin/finance/invoices/:id/issue   — 标记已开票
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service/index.js";
import {
  listAllInvoiceRequests,
  getInvoiceDetail,
  approveInvoice,
  rejectInvoice,
  issueInvoice,
  exportInvoicesCsv,
} from "../../services/invoice-service.js";

export async function adminInvoiceRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/invoices — 所有开票申请
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/invoices", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const query = request.query as {
        page?: string;
        pageSize?: string;
        status?: string;
        userId?: string;
      };

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));

      const result = await listAllInvoiceRequests(
        page,
        pageSize,
        query.status,
        query.userId ? parseInt(query.userId, 10) : undefined,
      );

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

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/invoices/export — CSV 导出
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/invoices/export", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const query = request.query as {
        status?: string;
        startDate?: string;
        endDate?: string;
      };

      const csv = await exportInvoicesCsv({
        status: query.status,
        startDate: query.startDate,
        endDate: query.endDate,
      });

      reply.header("Content-Type", "text/csv; charset=utf-8");
      const filename = `invoices_${new Date().toISOString().slice(0, 10)}.csv`;
      reply.header("Content-Disposition", `attachment; filename="${filename}"`);
      reply.status(200).send(csv);
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/invoices/:id — 申请详情
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/invoices/:id", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const invoiceId = parseInt(id, 10);

      if (isNaN(invoiceId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的发票 ID" });
        return;
      }

      const result = await getInvoiceDetail(invoiceId);

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

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/finance/invoices/:id/approve — 审核通过
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/finance/invoices/:id/approve", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const invoiceId = parseInt(id, 10);

      if (isNaN(invoiceId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的发票 ID" });
        return;
      }

      const result = await approveInvoice(invoiceId, request.user!.userId);

      reply.status(200).send({
        code: 0,
        data: result,
        message: "开票申请已审核通过",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/finance/invoices/:id/reject — 拒绝
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/finance/invoices/:id/reject", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const invoiceId = parseInt(id, 10);

      if (isNaN(invoiceId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的发票 ID" });
        return;
      }

      const body = request.body as { reason: string };
      if (!body.reason) {
        reply.status(400).send({ code: 400, data: null, message: "拒绝原因不能为空" });
        return;
      }

      const result = await rejectInvoice(invoiceId, request.user!.userId, body.reason);

      reply.status(200).send({
        code: 0,
        data: result,
        message: "开票申请已拒绝",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/finance/invoices/:id/issue — 标记已开票
  //  Body: { invoiceNo, fileUrl? }
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/finance/invoices/:id/issue", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const invoiceId = parseInt(id, 10);

      if (isNaN(invoiceId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的发票 ID" });
        return;
      }

      const body = request.body as { invoiceNo: string; fileUrl?: string };
      if (!body.invoiceNo) {
        reply.status(400).send({ code: 400, data: null, message: "发票号码不能为空" });
        return;
      }

      const result = await issueInvoice(invoiceId, request.user!.userId, body.invoiceNo, body.fileUrl);

      reply.status(200).send({
        code: 0,
        data: result,
        message: "已标记为已开票",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });
}
