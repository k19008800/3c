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
import { realNameRoutes } from "./real-name";
import { adminVendorKeyRoutes } from "./admin-vendor-key";
import { redemptionRoutes } from "./redemption";
import { announcementRoutes } from "./announcements";
import { emailTemplateRoutes } from "./email-templates";
import { campaignRoutes } from "./campaigns";
import { adminActivityRoutes } from "./admin-activity";
import { notificationRoutes } from "./notification";
import { adminVendorSettlementRoutes } from "./admin-vendor-settlement";
import { vendorSelfRoutes } from "./vendor-self";

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
  // §4.6 实名认证（用户端 + 管理端审核）
  void app.register(realNameRoutes, { prefix: "/api/v1" });
  // §4.3 Key 资源池（供应商 Key 管理）
  void app.register(adminVendorKeyRoutes, { prefix: "/api/v1" });
  // §4.5 兑换码系统（用户端 + 管理端）
  void app.register(redemptionRoutes, { prefix: "/api/v1" });
  // §4.5 公告系统（用户端 + 管理端）
  void app.register(announcementRoutes, { prefix: "/api/v1" });
  // §4.5 邮件模板（管理后台）
  void app.register(emailTemplateRoutes, { prefix: "/api/v1" });
  // §4.5 营销活动（管理后台）
  void app.register(campaignRoutes, { prefix: "/api/v1" });
  // §4.5 实时活动流（管理后台 SSE）
  void app.register(adminActivityRoutes, { prefix: "/api/v1" });
  // §4.5 通知订阅偏好（用户端）
  void app.register(notificationRoutes, { prefix: "/api/v1" });
  // §4.15 供应商结算管理（管理后台）
  void app.register(adminVendorSettlementRoutes, { prefix: "/api/v1" });
  // §4.10 供应商自助（注册/登录/自助管理）
  void app.register(vendorSelfRoutes, { prefix: "/api/v1" });
}

