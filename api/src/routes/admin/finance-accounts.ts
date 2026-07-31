// ============================================================
//  3cloud (3C) — 资金账户管理路由（SPEC-§29.2）
//  GET /api/v1/admin/finance/accounts       — 资金账户总览
//  GET /api/v1/admin/finance/accounts/trend — 资金变动趋势
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service/index.js";
import { getAccountsOverview, getAccountsTrend } from "../../services/finance-accounts.js";

export async function adminFinanceAccountsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/accounts — 资金账户总览
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/accounts", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (_request, reply) => {
    try {
      const data = await getAccountsOverview();
      reply.status(200).send({ code: 0, data, message: "ok" });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/accounts/trend — 资金变动趋势
  //  query: days (默认 30, 最大 90)
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/accounts/trend", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const query = request.query as { days?: string };
      const days = query.days ? parseInt(query.days, 10) : 30;
      const data = await getAccountsTrend(days);
      reply.status(200).send({ code: 0, data, message: "ok" });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });
}
