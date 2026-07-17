// ============================================================
//  3cloud (3C) — 兑换码系统路由入口
//  聚合所有子模块路由注册
//  导出：redemptionRoutes
//  注意：路由路径和外部导出接口保持不变
// ============================================================

import { FastifyInstance } from "fastify";
import { registerRedeemRoute } from "./redeem.js";
import { registerQueryRoutes } from "./query.js";
import { registerAgentRoutes } from "./agent.js";

export async function redemptionRoutes(app: FastifyInstance) {
  registerAgentRoutes(app);
  registerQueryRoutes(app);
  registerRedeemRoute(app);
}
