import type { FastifyInstance } from "fastify";
import { healthRoutes } from "./health";
import { engineRoutes } from "./engine";
import { proxyRoutes } from "./proxy";
import { monitoringRoutes } from "./admin-monitoring";
import { rateLimitAdminRoutes } from "./admin-rate-limit";
import { authRoutes } from "./auth";
import { publicRoutes } from "./public";
import { meRechargeRoutes } from "./me";
import { meBillingRoutes } from "./me-billing";

/**
 * 路由统一注册入口
 * 🔴 所有业务路由必须在此挂载注册（防漏注册红线）
 */
export function registerRoutes(app: FastifyInstance) {
  void app.register(healthRoutes, { prefix: "/api/v1/health" });
  // §5 核心引擎
  void app.register(engineRoutes, { prefix: "/api/v1/engine" });
  // §5 API 网关（OpenAI 兼容端点，根路径）
  void app.register(proxyRoutes);
  // §5.4/§5.3 告警与限流管理端（admin 前缀）
  void app.register(monitoringRoutes, { prefix: "/api/v1" });
  void app.register(rateLimitAdminRoutes, { prefix: "/api/v1" });
  // §2 用户认证
  void app.register(authRoutes, { prefix: "/api/v1" });
  // §6 Portal 公开数据
  void app.register(publicRoutes, { prefix: "/api/v1" });
  // §2.2.6 充值中心（Console 胶层）
  void app.register(meRechargeRoutes, { prefix: "/api/v1" });
  // §5.2 账单中心（Console 胶层）
  void app.register(meBillingRoutes, { prefix: "/api/v1" });
}

