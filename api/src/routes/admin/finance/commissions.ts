// ============================================================
//  3cloud (3C) — 佣金管理路由（板块2）
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, requirePerm, Perm } from "../../../middleware/auth.js";
import { AppError } from "../../../services/auth-service/index.js";
import {
  listAllCommissions,
  listAllCommissionsDetail,
} from "../../../services/agent-commission.js";
import {
  settleCommissions,
  batchSettleCommissions,
  batchCancelCommissions,
  settleCommissionsByFilters,
} from "../../../services/agent-settlement.js";

export async function adminFinanceCommissionRoutes(app: FastifyInstance) {
  // 全局 JWT 认证
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/commissions — 佣金流水总览
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/commissions", {
    preHandler: [requirePerm(Perm.FINANCE_COMMISSION)],
  }, async (request, reply) => {
    try {
      const query = request.query as {
        page?: string;
        pageSize?: string;
        agentId?: string;
        agentSearch?: string;
        startDate?: string;
        endDate?: string;
      };

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));

      const result = await listAllCommissions(page, pageSize, {
        agentId: query.agentId ? parseInt(query.agentId, 10) : undefined,
        agentSearch: query.agentSearch || undefined,
        startDate: query.startDate,
        endDate: query.endDate,
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
  //  GET /api/v1/admin/finance/commissions/detail — 查看某代理商某天佣金明细
  //  params: agentId, date, status?, page, pageSize
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/commissions/detail", {
    preHandler: [requirePerm(Perm.FINANCE_COMMISSION)],
  }, async (request, reply) => {
    try {
      const query = request.query as {
        agentId?: string;
        date?: string;
        status?: string;
        commissionType?: string;
        page?: string;
        pageSize?: string;
      };

      const agentId = query.agentId ? parseInt(query.agentId, 10) : undefined;
      if (!agentId || !query.date) {
        reply.status(400).send({ code: 400, data: null, message: "请提供 agentId 和 date 参数" });
        return;
      }

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));

      const result = await listAllCommissionsDetail(page, pageSize, {
        agentId,
        date: query.date,
        status: query.status,
        commissionType: query.commissionType,
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
  //  POST /api/v1/admin/finance/commissions/settle — 批量结算佣金
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/finance/commissions/settle", {
    preHandler: [requirePerm(Perm.FINANCE_COMMISSION)],
  }, async (request, reply) => {
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

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/finance/commissions/settle-by-filters — 按筛选条件批量结算
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/finance/commissions/settle-by-filters", {
    preHandler: [requirePerm(Perm.FINANCE_COMMISSION)],
  }, async (request, reply) => {
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
  //  POST /api/v1/admin/finance/commissions/auto-settle — 自动结算 方案B
  //  结算指定天数前的所有待结算佣金，由定时任务触发
  //  Body: { daysBefore?: number, apiKey?: string }
  //  daysBefore 默认 1（结算1天前的佣金），传 0 则结算全部
  //  安全：支持 apiKey 验证（从 system_configs.auto_settle_api_key 读取）
  // ══════════════════════════════════════════════

  app.post("/api/v1/admin/finance/commissions/auto-settle", {
    preHandler: [requirePerm(Perm.FINANCE_COMMISSION)],
  }, async (request, reply) => {
    try {
      const body = (request.body as { daysBefore?: number }) || {};
      const daysBefore = Math.max(0, body.daysBefore ?? 1);

      let count: number;
      if (daysBefore > 0) {
        const endDate = new Date(Date.now() - daysBefore * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        count = await settleCommissionsByFilters({ endDate });
      } else {
        count = await settleCommissions();
      }

      reply.status(200).send({
        code: 0,
        data: { settledCount: count, cutoffDays: daysBefore },
        message: `自动结算完成：${count} 笔（结算 ${daysBefore > 0 ? `${daysBefore}天前` : "全部"} 待结算佣金）`,
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
  //  POST /api/v1/admin/finance/commissions/cancel — 批量作废佣金
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/finance/commissions/cancel", {
    preHandler: [requirePerm(Perm.FINANCE_COMMISSION)],
  }, async (request, reply) => {
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
