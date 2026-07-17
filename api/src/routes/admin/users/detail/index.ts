import { FastifyInstance } from "fastify";
import { registerInfoRoutes } from "./info.js";
import { registerBalanceRoutes } from "./balance.js";
import { registerLogsRoutes } from "./logs.js";
import { registerActionsRoutes } from "./actions.js";

/**
 * 用户详情路由入口。
 * 委托到各子模块注册具体路由。
 */
export async function detailRoutes(app: FastifyInstance) {
  registerInfoRoutes(app);
  registerBalanceRoutes(app);
  registerLogsRoutes(app);
  registerActionsRoutes(app);
}
