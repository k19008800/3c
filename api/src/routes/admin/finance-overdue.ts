// ============================================================
//  3cloud (3C) — 违约金与逾期管理路由（SPEC-§29.6）
//  GET  /api/v1/admin/finance/overdue/list      — 逾期列表
//  GET  /api/v1/admin/finance/overdue/stats     — 逾期统计
//  POST /api/v1/admin/finance/overdue/:id/waive — 减免罚息
//  POST /api/v1/admin/finance/overdue/:id/suspend — 暂停额度
//  POST /api/v1/admin/finance/overdue/notify    — 批量催收通知
//  POST /api/v1/admin/finance/overdue/refresh   — 手动刷新逾期计算
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service/index.js";
import {
  listOverdue,
  getOverdueStats,
  waivePenalty,
  suspendCredit,
  batchNotifyOverdue,
  refreshOverdue,
} from "../../services/finance-overdue.js";

export async function adminFinanceOverdueRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 逾期列表 ──
  app.get("/api/v1/admin/finance/overdue/list", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const query = request.query as Record<string, string>;
      const data = await listOverdue({
        stage: query.stage,
        status: query.status,
        userId: query.userId ? parseInt(query.userId, 10) : undefined,
        keyword: query.keyword,
        page: query.page ? parseInt(query.page, 10) : undefined,
        pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
      });
      reply.status(200).send({ code: 0, data, message: "ok" });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ── 逾期统计 ──
  app.get("/api/v1/admin/finance/overdue/stats", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (_request, reply) => {
    try {
      const data = await getOverdueStats();
      reply.status(200).send({ code: 0, data, message: "ok" });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ── 减免罚息 ──
  app.post("/api/v1/admin/finance/overdue/:id/waive", {
    preHandler: [requirePerm(Perm.RECONCILIATION_MANAGE)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = (request.body as { note?: string }) || {};
      const data = await waivePenalty(parseInt(id, 10), request.user!.userId, body.note);
      reply.status(200).send({ code: 0, data, message: "罚息已减免" });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ── 暂停额度 ──
  app.post("/api/v1/admin/finance/overdue/:id/suspend", {
    preHandler: [requirePerm(Perm.RECONCILIATION_MANAGE)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const data = await suspendCredit(parseInt(id, 10), request.user!.userId);
      reply.status(200).send({ code: 0, data, message: "信用额度已暂停" });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ── 批量催收通知 ──
  app.post("/api/v1/admin/finance/overdue/notify", {
    preHandler: [requirePerm(Perm.RECONCILIATION_MANAGE)],
  }, async (request, reply) => {
    try {
      const body = (request.body as { ids?: number[] }) || {};
      const data = await batchNotifyOverdue(request.user!.userId, body.ids);
      reply.status(200).send({ code: 0, data, message: "催收通知已发送" });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ── 手动刷新逾期计算 ──
  app.post("/api/v1/admin/finance/overdue/refresh", {
    preHandler: [requirePerm(Perm.RECONCILIATION_MANAGE)],
  }, async (_request, reply) => {
    try {
      const data = await refreshOverdue();
      reply.status(200).send({ code: 0, data, message: `逾期计算刷新完成（${data.refreshed} 条）` });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });
}
