import { FastifyInstance } from "fastify";
import { registerAuthHook, clearUserLimitCache } from "./auth.js";
import { registerForwardRoutes } from "./forward.js";

/**
 * 3cloud Token 代理路由入口。
 *
 * 路由注册流程：
 * 1. 认证 + 限流 hook（auth.ts）
 * 2. 转发/计费路由（forward.ts）
 */
export async function proxyRoutes(app: FastifyInstance) {
  registerAuthHook(app);
  registerForwardRoutes(app);
}

export { clearUserLimitCache };
