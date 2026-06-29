// ============================================================
//  3cloud (3C) — 财务路由（管理员）
//  GET    /api/v1/admin/finance/dashboard       — 财务工作台
//  GET    /api/v1/admin/finance/commissions     — 佣金流水总览
//  GET    /api/v1/admin/finance/reconciliation  — 对账报表
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, requireRole } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service.js";
import {
  getFinanceDashboard,
  listAllCommissions,
  getReconciliationReport,
  settleCommissions,
  batchSettleCommissions,
  batchCancelCommissions,
  settleCommissionsByFilters,
} from "../../services/agent-service.js";

export async function adminFinanceRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);
  app.addHook("preHandler", requireRole("super_admin", "admin"));

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/dashboard — 财务工作台
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/dashboard", async (request, reply) => {
    try {
      const result = await getFinanceDashboard();

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
  //  GET /api/v1/admin/finance/commissions — 佣金流水总览
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/commissions", async (request, reply) => {
    try {
      const query = request.query as {
        page?: string;
        pageSize?: string;
        cursor?: string;
        agentId?: string;
        agentSearch?: string;
        status?: string;
        commissionType?: string;
        startDate?: string;
        endDate?: string;
      };

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
      const cursor = query.cursor;

      const result = await listAllCommissions(page, pageSize, {
        agentId: query.agentId ? parseInt(query.agentId, 10) : undefined,
        agentSearch: query.agentSearch || undefined,
        status: query.status,
        commissionType: query.commissionType,
        startDate: query.startDate,
        endDate: query.endDate,
        cursor,
      });

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
  //  GET /api/v1/admin/finance/reconciliation — 对账报表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/reconciliation", async (request, reply) => {
    try {
      const query = request.query as { date?: string };
      const result = await getReconciliationReport(query.date);

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

  // ══════════════════════════════════════════════
  //  POST /api/v1/admin/finance/commissions/settle — 批量结算佣金
  // ══════════════════════════════════════════════

  app.post("/api/v1/admin/finance/commissions/settle", async (request, reply) => {
    try {
      const body = request.body as { ids?: number[] } || {};
      const count = body.ids?.length
        ? await batchSettleCommissions(body.ids)
        : await settleCommissions();
      reply.status(200).send({ code: 0, data: { settledCount: count }, message: `成功结算 ${count} 笔佣金` });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ══════════════════════════════════════════════
  //  POST /api/v1/admin/finance/commissions/settle-by-filters — 按筛选条件批量结算
  // ══════════════════════════════════════════════

  app.post("/api/v1/admin/finance/commissions/settle-by-filters", async (request, reply) => {
    try {
      const body = request.body as {
        agentId?: number;
        startDate?: string;
        endDate?: string;
        commissionType?: string;
      } || {};
      const count = await settleCommissionsByFilters(body);
      reply.status(200).send({
        code: 0,
        data: { settledCount: count },
        message: `成功结算 ${count} 笔佣金`,
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ══════════════════════════════════════════════
  //  POST /api/v1/admin/finance/commissions/cancel — 批量作废佣金
  // ══════════════════════════════════════════════

  app.post("/api/v1/admin/finance/commissions/cancel", async (request, reply) => {
    try {
      const body = request.body as { ids: number[] };
      if (!body.ids?.length) {
        reply.status(400).send({ code: 400, data: null, message: "请选择要作废的佣金记录" });
        return;
      }
      const count = await batchCancelCommissions(body.ids);
      reply.status(200).send({ code: 0, data: { cancelledCount: count }, message: `成功作废 ${count} 笔佣金` });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });
}
