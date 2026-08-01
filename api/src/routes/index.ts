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
import { meAgentRoutes } from "./me-agent";
import { adminAgentRoutes } from "./admin-agent";
import { meAgentWithdrawRoutes } from "./me-agent-withdraw";
import { adminAgentWithdrawRoutes } from "./admin-agent-withdraw";
import { adminVendorModelRoutes } from "./admin-vendor-model";
import { invoiceRoutes } from "./invoice";

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
  // §3 代理设置（Console 胶层）
  void app.register(meAgentRoutes, { prefix: "/api/v1" });
  // §3.1 代理管理审核端（管理后台）
  void app.register(adminAgentRoutes, { prefix: "/api/v1" });
  // §3.4 代理提现（代理端）
  void app.register(meAgentWithdrawRoutes, { prefix: "/api/v1" });
  // §3.4 代理提现审核端（管理后台双审）
  void app.register(adminAgentWithdrawRoutes, { prefix: "/api/v1" });
  // §4.3 供应商与模型管理（管理后台）
  void app.register(adminVendorModelRoutes, { prefix: "/api/v1" });
  // §9.6 发票模块（用户端 + 管理端税票看板）
  void app.register(invoiceRoutes, { prefix: "/api/v1" });
}

