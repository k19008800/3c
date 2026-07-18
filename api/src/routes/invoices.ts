// ============================================================
//  3cloud (3C) — 发票路由（用户端）
//  POST   /api/v1/invoices                — 提交开票申请
//  GET    /api/v1/invoices                — 我的开票记录（分页）
//  GET    /api/v1/invoices/available-amount — 可开票额度
//  GET    /api/v1/invoices/:id            — 开票详情
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, guardNotImpersonating, guardNotImpersonatingWrite } from "../middleware/auth.js";
import { AppError } from "../services/auth-service/index.js";
import {
  createInvoiceRequest,
  getUserInvoices,
  getInvoiceDetail,
  getUserRechargeTotal,
} from "../services/invoice-service.js";

export async function invoiceRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────
  //  POST /api/v1/invoices — 提交开票申请
  // ──────────────────────────────────────────────

  app.post("/api/v1/invoices", {
    preHandler: [authenticateJWT, guardNotImpersonating],
    handler: async (request, reply) => {
      try {
        const body = request.body as {
          amount: string;
          invoiceType: "normal" | "special";
          invoiceTitle: string;
          invoiceTaxId?: string;
          bankName?: string;
          bankAccount?: string;
          companyAddress?: string;
          companyPhone?: string;
          refOrderId?: number;
        };

        if (!body.amount || !body.invoiceTitle) {
          reply.status(400).send({ code: 400, data: null, message: "金额和发票抬头为必填项" });
          return;
        }

        const result = await createInvoiceRequest(
          request.user!.userId,
          body.amount,
          body.invoiceType || "normal",
          body.invoiceTitle,
          body.invoiceTaxId,
          {
            bankName: body.bankName,
            bankAccount: body.bankAccount,
            companyAddress: body.companyAddress,
            companyPhone: body.companyPhone,
          },
          body.refOrderId,
        );

        reply.status(200).send({
          code: 0,
          data: result,
          message: "开票申请提交成功",
        });
      } catch (err: any) {
        if (err instanceof AppError) {
          reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
          return;
        }
        throw err;
      }
    },
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/invoices — 我的开票记录
  // ──────────────────────────────────────────────

  app.get("/api/v1/invoices", {
    preHandler: [authenticateJWT, guardNotImpersonatingWrite],
    handler: async (request, reply) => {
      try {
        const query = request.query as {
          page?: string;
          pageSize?: string;
          status?: string;
        };

        const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));

        const result = await getUserInvoices(
          request.user!.userId,
          page,
          pageSize,
          query.status,
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
    },
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/invoices/available-amount — 可开票额度
  // ──────────────────────────────────────────────

  app.get("/api/v1/invoices/available-amount", {
    preHandler: [authenticateJWT, guardNotImpersonatingWrite],
    handler: async (request, reply) => {
      try {
        const total = await getUserRechargeTotal(request.user!.userId);

        reply.status(200).send({
          code: 0,
          data: { availableAmount: total.toFixed(6) },
          message: "ok",
        });
      } catch (err: any) {
        if (err instanceof AppError) {
          reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
          return;
        }
        throw err;
      }
    },
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/invoices/:id — 开票详情
  // ──────────────────────────────────────────────

  app.get("/api/v1/invoices/:id", {
    preHandler: [authenticateJWT, guardNotImpersonatingWrite],
    handler: async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const invoiceId = parseInt(id, 10);

        if (isNaN(invoiceId)) {
          reply.status(400).send({ code: 400, data: null, message: "无效的发票 ID" });
          return;
        }

        const result = await getInvoiceDetail(invoiceId, request.user!.userId);

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
    },
  });
}
