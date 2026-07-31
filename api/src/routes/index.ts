import type { FastifyInstance } from "fastify";
import { healthRoutes } from "./health";

/**
 * 路由统一注册入口
 * 🔴 所有业务路由必须在此挂载注册（防漏注册红线）
 * Phase 1 扩展：userRoutes / authRoutes / modelRoutes / proxyRoutes ...
 */
export function registerRoutes(app: FastifyInstance) {
  void app.register(healthRoutes, { prefix: "/api/v1/health" });
  // Phase 1+:
  // void app.register(authRoutes, { prefix: "/api/v1/auth" });
  // void app.register(userRoutes, { prefix: "/api/v1/users" });
}
