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
import { meAgentWithdrawRoutes } from "./me-agent-withdraw";
import { meSecurityRoutes } from "./me-security";
import { meConsentRoutes } from "./me-consent";
import { meTicketsRoutes } from "./me-tickets";
import { meChatRoutes } from "./me-chat";
import { announcementRoutes } from "./announcements";
import { notificationRoutes } from "./notification";
import { realNameRoutes } from "./real-name";
import { redemptionRoutes } from "./redemption";
import { invoiceRoutes } from "./invoice";
import { adminAgentRoutes } from "./admin-agent";
import { adminAgentWithdrawRoutes } from "./admin-agent-withdraw";
import { adminVendorModelRoutes } from "./admin-vendor-model";
import { adminVendorKeyRoutes } from "./admin-vendor-key";
import { adminVendorSettlementRoutes } from "./admin-vendor-settlement";
import { adminSecurityRoutes } from "./admin-security";
import { adminFinanceRoutes } from "./admin-finance";
import { adminConsentRoutes } from "./admin-consent";
import { adminPermissionRoutes } from "./admin-permission";
import { adminTicketsRoutes } from "./admin-tickets";
import { adminChatRoutes } from "./admin-chat";
import { adminSupportRoutes } from "./admin-support";
import { adminActivityRoutes } from "./admin-activity";
import { adminSysRoutes } from "./admin-sys";
import { campaignRoutes } from "./campaigns";
import { emailTemplateRoutes } from "./email-templates";
import { vendorSelfRoutes } from "./vendor-self";
import { crmRoutes } from "./crm";
import { meDeletionRoutes } from "./me-deletion";
import { adminDeletionRoutes } from "./admin-deletion";
import { adminSettlementRoutes } from "./admin-settlement";
import { agentSettlementRoutes } from "./agent-settlement";
import { knowledgeBaseRoutes } from "./knowledge-base";
import { webhookRoutes } from "./admin-webhooks";
import { ssoRoutes } from "./admin-sso";
import { meOnboardingRoutes } from "./me-onboarding";
import { meNotificationPreferencesRoutes } from "./me-notification-preferences";
import { meStatsRoutes } from "./me-stats";
import { meEnhanceRoutes } from "./me-enhance";
import { meWebhooksRoutes } from "./me-webhooks";
import { meTeamRoutes } from "./me-team";
import { wsChatRoutes } from "./ws-chat";
import { adminBalanceAlertRoutes } from "./admin-balance-alert";
import { adminCustomerLifecycleRoutes } from "./admin-customer-lifecycle";
import { adminSubscriptionRoutes } from "./admin-subscription";
import { mePlaygroundRoutes } from "./me-playground";

/**
 * 路由统一注册入口
 * 🔴 所有业务路由必须在此挂载注册（防漏注册红线）
 * 🔴 所有模块统一使用 /api/v1 前缀
 */
export function registerRoutes(app: FastifyInstance) {
  const prefix = "/api/v1";

  // §0 基础
  void app.register(healthRoutes, { prefix: `${prefix}/health` });
  // §5 核心引擎
  void app.register(engineRoutes, { prefix: `${prefix}/engine` });
  // §5 API 网关（OpenAI 兼容端点，根路径）
  void app.register(proxyRoutes);
  // §5.4/§5.3 告警与限流管理端
  void app.register(monitoringRoutes, { prefix });
  void app.register(rateLimitAdminRoutes, { prefix });

  // §2 用户认证
  void app.register(authRoutes, { prefix });

  // §2 用户端: 充值
  void app.register(meRechargeRoutes, { prefix });
  // §2 用户端: 账单
  void app.register(meBillingRoutes, { prefix });
  // §2 用户端: 实名认证
  void app.register(realNameRoutes, { prefix });
  // §2 用户端: 兑换码
  void app.register(redemptionRoutes, { prefix });

  // §3 代理商用户端
  void app.register(meAgentRoutes, { prefix });
  void app.register(meAgentWithdrawRoutes, { prefix });
  // §3 代理商管理端
  void app.register(adminAgentRoutes, { prefix });
  void app.register(adminAgentWithdrawRoutes, { prefix });

  // §4 供应商管理端
  void app.register(adminVendorModelRoutes, { prefix });
  void app.register(adminVendorKeyRoutes, { prefix });
  void app.register(adminVendorSettlementRoutes, { prefix });
  // §4 供应商自助
  void app.register(vendorSelfRoutes, { prefix: `${prefix}/vendor` });

  // §4.8 系统配置
  void app.register(adminSysRoutes, { prefix });

  // §6 Portal 公开数据
  void app.register(publicRoutes, { prefix });

  // §8 运营增长
  void app.register(campaignRoutes, { prefix });
  void app.register(announcementRoutes, { prefix });

  // §9 发票
  void app.register(invoiceRoutes, { prefix });

  // §11 CRM
  void app.register(crmRoutes, { prefix });

  // §20 用户端安全与预算
  void app.register(meSecurityRoutes, { prefix });
  void app.register(adminSecurityRoutes, { prefix });

  // §26 工单系统
  void app.register(meTicketsRoutes, { prefix });
  void app.register(adminTicketsRoutes, { prefix });

  // §27 在线客服
  void app.register(meChatRoutes, { prefix });
  void app.register(adminChatRoutes, { prefix });
  // §32.1 全局 Webhook（用户端）
  void app.register(meWebhooksRoutes, { prefix });
  // §32.4 团队管理
  void app.register(meTeamRoutes, { prefix });

  // §27 WebSocket 端点（独立前缀，非 REST）
  void app.register(wsChatRoutes, { prefix: "/ws" });

  // §28 智能客服
  void app.register(adminSupportRoutes, { prefix });

  // §29 资金对账
  void app.register(adminFinanceRoutes, { prefix });

  // §30 权限管理
  void app.register(adminPermissionRoutes, { prefix });

  // §33 合规法务
  void app.register(meConsentRoutes, { prefix });
  void app.register(adminConsentRoutes, { prefix });

  // 活动流
  void app.register(adminActivityRoutes, { prefix });

  // 账号注销（Sprint 1）
  void app.register(meDeletionRoutes, { prefix });
  void app.register(adminDeletionRoutes, { prefix });

  // 代理结算对账（Sprint 1）
  void app.register(adminSettlementRoutes, { prefix });
  void app.register(agentSettlementRoutes, { prefix });

  // §10 客服支撑：知识库 + 快捷回复
  void app.register(knowledgeBaseRoutes, { prefix });

  // §32.1 全局 Webhook
  void app.register(webhookRoutes, { prefix });

  // §22.1 Onboarding 新用户引导
  void app.register(meOnboardingRoutes, { prefix });
  // §22.2 Dashboard 统计
  void app.register(meStatsRoutes, { prefix });
  // §22.7~§22.12 用户端增强补充 API
  void app.register(meEnhanceRoutes, { prefix });
  // §22.6 通知偏好增强
  void app.register(meNotificationPreferencesRoutes, { prefix });

  // §32.2/§32.3 SSO + 企业通讯录
  void app.register(ssoRoutes, { prefix });

  // 邮件模板
  void app.register(emailTemplateRoutes, { prefix });

  // 通知订阅
  void app.register(notificationRoutes, { prefix });

  // §20.6 余额预警管理
  void app.register(adminBalanceAlertRoutes, { prefix });

  // §11 客户生命周期
  void app.register(adminCustomerLifecycleRoutes, { prefix });

  // 订阅计划管理
  void app.register(adminSubscriptionRoutes, { prefix });

  // Playground / API 调试
  void app.register(mePlaygroundRoutes, { prefix });
}
