// ============================================================
//  3cloud (3C) — 代理商面板路由
//  GET    /api/v1/agent/dashboard                — 代理商面板
//  GET    /api/v1/agent/dashboard/income-trend   — 收入趋势
//  GET    /api/v1/agent/dashboard/income-structure — 收入结构
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service.js";
import {
  getAgentDashboard,
  getAgentIncomeTrend,
  getAgentIncomeStructure,
} from "../../services/agent-core.js";

export async function agentDashboardRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────
  //  GET /api/v1/agent/dashboard — 代理商面板
  // ──────────────────────────────────────────────

  app.get("/api/v1/agent/dashboard", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const result = await getAgentDashboard(request.user!.userId);

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
  //  GET /api/v1/agent/dashboard/income-trend?days=30 — 收入趋势
  // ──────────────────────────────────────────────

  app.get("/api/v1/agent/dashboard/income-trend", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const query = request.query as { days?: string };
        const days = Math.min(365, Math.max(1, parseInt(query.days ?? "30", 10) || 30));

        const result = await getAgentIncomeTrend(request.user!.userId, days);

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
  //  GET /api/v1/agent/dashboard/income-structure — 收入结构
  // ──────────────────────────────────────────────

  app.get("/api/v1/agent/dashboard/income-structure", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const result = await getAgentIncomeStructure(request.user!.userId);

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
