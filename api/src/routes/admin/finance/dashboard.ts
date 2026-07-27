// ============================================================
//  3cloud (3C) — 财务工作台路由（板块1）
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, requirePerm, Perm } from "../../../middleware/auth.js";
import { AppError } from "../../../services/auth-service/index.js";
import { getFinanceDashboard } from "../../../services/agent-finance.js";

export async function adminFinanceDashboardRoutes(app: FastifyInstance) {
  // 全局 JWT 认证
  app.addHook("preHandler", authenticateJWT);

  // ════════════════════════════════════════════════════════════
  //  GET /api/v1/admin/finance/dashboard — 财务工作台
  // ════════════════════════════════════════════════════════════

  app.get("/api/v1/admin/finance/dashboard", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
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
}
