// ============================================================
//  3cloud (3C) — 代理商路由入口
//  将各子路由模块合并为一个注册函数
// ============================================================

import { FastifyInstance } from "fastify";
import { agentDashboardRoutes } from "./dashboard.js";
import { agentClientRoutes } from "./clients.js";
import { agentCommissionRoutes } from "./commissions.js";
import { agentWithdrawRoutes } from "./withdraw.js";
import { agentQuotaRoutes } from "./quotas.js";

export async function agentRoutes(app: FastifyInstance) {
  // 子路由注册：每个子模块负责自身路由前缀
  await app.register(agentDashboardRoutes, { prefix: "" });
  await app.register(agentClientRoutes, { prefix: "" });
  await app.register(agentCommissionRoutes, { prefix: "" });
  await app.register(agentWithdrawRoutes, { prefix: "" });
  await app.register(agentQuotaRoutes, { prefix: "" });
}
