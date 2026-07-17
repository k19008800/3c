// ============================================================
//  3cloud (3C) — Admin 兑换码增强路由入口
//  聚合所有子模块路由注册
//  导出：adminRedemptionEnhancedRoutes
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT } from "../../../middleware/auth.js";
import { registerBatchActionRoute } from "./batch-action.js";
import { registerExportRoute } from "./export.js";
import { registerRiskActionRoute } from "./risk-action.js";
import { registerAuditLogsRoute } from "./audit-logs.js";
import { registerReportsRoute } from "./reports.js";

export async function adminRedemptionEnhancedRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  registerBatchActionRoute(app);
  registerExportRoute(app);
  registerRiskActionRoute(app);
  registerAuditLogsRoute(app);
  registerReportsRoute(app);
}
