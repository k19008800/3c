// ============================================================
//  3cloud (3C) — 财务锁账与结转路由（SPEC-§29.4）
//  GET  /api/v1/admin/finance/close/status         — 当前结账状态
//  POST /api/v1/admin/finance/close/execute        — 执行结账
//  GET  /api/v1/admin/finance/close/history        — 历史结账记录
//  POST /api/v1/admin/finance/close/:period/unlock — 临时解锁（超管）
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service/index.js";
import {
  getCloseStatus,
  executeClose,
  listCloseHistory,
  unlockPeriod,
} from "../../services/finance-close.js";

export async function adminFinanceCloseRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 当前结账状态 ──
  app.get("/api/v1/admin/finance/close/status", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (_request, reply) => {
    try {
      const data = await getCloseStatus();
      reply.status(200).send({ code: 0, data, message: "ok" });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ── 执行结账 ──
  app.post("/api/v1/admin/finance/close/execute", {
    preHandler: [requirePerm(Perm.RECONCILIATION_MANAGE)],
  }, async (request, reply) => {
    try {
      const data = await executeClose(request.user!.userId, request.ip);
      reply.status(200).send({
        code: 0,
        data,
        message: `结账成功，结转凭证 ${data.carryVoucherNo}`,
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ── 历史结账记录 ──
  app.get("/api/v1/admin/finance/close/history", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const query = request.query as { page?: string; pageSize?: string };
      const data = await listCloseHistory(
        query.page ? parseInt(query.page, 10) : 1,
        query.pageSize ? parseInt(query.pageSize, 10) : 20
      );
      reply.status(200).send({ code: 0, data, message: "ok" });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ── 临时解锁（超管） ──
  app.post("/api/v1/admin/finance/close/:period/unlock", {
    preHandler: [requirePerm(Perm.RECONCILIATION_MANAGE)],
  }, async (request, reply) => {
    try {
      const { period } = request.params as { period: string };
      if (!/^\d{4}-\d{2}$/.test(period)) {
        reply.status(400).send({ code: 400, data: null, message: "期间格式错误，应为 YYYY-MM" });
        return;
      }
      const data = await unlockPeriod(period, request.user!.userId, request.ip);
      reply.status(200).send({
        code: 0,
        data,
        message: `期间 ${period} 已临时解锁，1 小时后自动重新锁定`,
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
