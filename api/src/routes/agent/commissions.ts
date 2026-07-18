// ============================================================
//  3cloud (3C) — 代理商佣金路由
//  GET    /api/v1/agent/commissions              — 佣金历史
//  GET    /api/v1/agent/commissions/summary      — 佣金汇总
//  GET    /api/v1/agent/commissions/export       — 佣金导出 CSV
//  GET    /api/v1/agent/commissions/:id          — 佣金详情
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service/index.js";
import {
  getAgentCommissions,
  getAgentCommissionSummary,
  getAgentCommissionDetail,
  exportAgentCommissionsCsv,
} from "../../services/agent-commission.js";
import { agentCommissionQuerySchema } from "../../schemas.js";
import type { AgentCommissionQuery } from "../../schemas.js";

export async function agentCommissionRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────
  //  GET /api/v1/agent/commissions — 佣金历史（增强筛选）
  // ──────────────────────────────────────────────

  app.get("/api/v1/agent/commissions", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const query = request.query as Record<string, string | undefined>;
        const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));

        const result = await getAgentCommissions(
          request.user!.userId,
          page,
          pageSize,
          {
            status: query.status,
            commissionType: query.commissionType,
            startDate: query.startDate,
            endDate: query.endDate,
            customerSearch: query.customerSearch,
          },
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
  //  GET /api/v1/agent/commissions/summary — 佣金汇总统计
  // ──────────────────────────────────────────────

  app.get("/api/v1/agent/commissions/summary", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const result = await getAgentCommissionSummary(request.user!.userId);

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
  //  GET /api/v1/agent/commissions/export — 佣金导出 CSV
  // ──────────────────────────────────────────────

  app.get("/api/v1/agent/commissions/export", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const query = request.query as Record<string, string | undefined>;
        const csv = await exportAgentCommissionsCsv(
          request.user!.userId,
          {
            status: query.status,
            commissionType: query.commissionType,
            startDate: query.startDate,
            endDate: query.endDate,
          },
        );

        reply.header("Content-Type", "text/csv; charset=utf-8");
        reply.header("Content-Disposition", `attachment; filename="commission_export_${Date.now()}.csv"`);
        reply.status(200).send(csv);
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
  //  GET /api/v1/agent/commissions/:id — 单条佣金详情
  // ──────────────────────────────────────────────

  app.get("/api/v1/agent/commissions/:id", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const commissionId = parseInt(id, 10);
        if (isNaN(commissionId)) {
          reply.status(400).send({ code: 400, data: null, message: "无效的佣金 ID" });
          return;
        }

        const result = await getAgentCommissionDetail(request.user!.userId, commissionId);

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
