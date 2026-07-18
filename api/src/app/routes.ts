// ============================================================
//  3cloud (3C) — Route Registration
// ============================================================

import type { FastifyInstance } from "fastify";

import { authRoutes } from "../routes/auth/index.js";
import { apiKeyRoutes } from "../routes/api-keys.js";
import { adminVendorRoutes } from "../routes/admin/vendors.js";
import { adminModelRoutes } from "../routes/admin/models.js";
import { adminVendorModelRoutes } from "../routes/admin/vendor-models.js";
import { adminKeyGroupRoutes } from "../routes/admin/vendor-key-groups.js";
import { adminKeyModelPricesRoutes } from "../routes/admin/key-model-prices.js";
import { adminBatchRoutes } from "../routes/admin/batch.js";
import { adminContentFilterRoutes } from "../routes/admin/content-filters.js";
import { adminLogAnalysisRoutes } from "../routes/admin/log-analysis.js";
import { playgroundRoutes } from "../routes/playground.js";
import { adminTemplateRoutes } from "../routes/admin/templates.js";
import { adminUndoRoutes } from "../routes/admin/undo.js";
import { proxyRoutes } from "../routes/proxy.js";
import { rechargeRoutes } from "../routes/recharge.js";
import { modelListRoutes } from "../routes/models.js";
import { logRoutes } from "../routes/logs.js";
import { adminUserRoutes } from "../routes/admin/users/index.js";
import { adminReviewRoutes } from "../routes/admin/reviews.js";
import { adminApiKeyRoutes as adminApiKeyMgmtRoutes } from "../routes/admin/api-keys.js";
import { adminSystemRoutes } from "../routes/admin/system.js";
import { agentRoutes } from "../routes/agent/index.js";
import { adminAgentRoutes } from "../routes/admin/agents.js";
import { adminCampaignRoutes } from "../routes/admin/campaigns.js";
import { adminDashboardRoutes } from "../routes/admin/dashboard/index.js";
import { adminLogRoutes } from "../routes/admin/logs.js";
import { adminFinanceRoutes } from "../routes/admin/finance.js";
import { adminAuditLogRoutes } from "../routes/admin/audit-logs.js";
import { adminOperationLogRoutes } from "../routes/admin/operation-logs.js";
import { userOperationLogRoutes } from "../routes/operation-logs.js";
import { adminQuotaRoutes } from "../routes/admin/quotas.js";
import { adminRateLimitRoutes } from "../routes/admin/rate-limits.js";
import { adminCircuitRoutes } from "../routes/admin/circuits.js";
import { adminStatsRoutes } from "../routes/admin/stats.js";
import { adminStatsUsageRoutes } from "../routes/admin/stats-usage.js";
import { meStatsRoutes } from "../routes/stats.js";
import { statsUsageRoutes } from "../routes/stats-usage.js";
import { agentStatsUsageRoutes } from "../routes/agent/stats-usage.js";
import { redemptionRoutes } from "../routes/redemption/index.js";
import { redemptionGiftRoutes } from "../routes/redemption-gift.js";
import { adminAgentRedemptionRoutes } from "../routes/admin/agent-redemption.js";
import { adminRedemptionFraudRoutes } from "../routes/admin/redemption-fraud.js";
import { adminFinanceCodeRoutes } from "../routes/admin/finance/codes/index.js";
import { vendorSelfRoutes, vendorJWTRoutes } from "../routes/vendor-self.js";
import { adminKeyManagementRoutes } from "../routes/admin/admin-keys.js";
import { adminRoleRoutes } from "../routes/admin/roles.js";
import { realNameFileRoutes } from "../routes/real-name-file.js";
import { notificationRoutes } from "../routes/notifications.js";
import { authSecurityRoutes } from "../routes/auth-security.js";
import { adminSecurityRoutes } from "../routes/admin/security/index.js";
import { adminAnnouncementRoutes } from "../routes/admin/announcements.js";
import { announcementRoutes } from "../routes/announcements.js";
import { preferenceRoutes } from "../routes/preferences.js";
import { realNameOcrRoutes } from "../routes/real-name-ocr.js";
import { invoiceRoutes } from "../routes/invoices.js";
import { refundRoutes } from "../routes/refunds.js";
import { adminInvoiceRoutes } from "../routes/admin/invoices.js";
import { adminRefundRoutes } from "../routes/admin/refunds.js";
import { profitRoutes } from "../routes/admin/profit.js";
import { priceRoutes } from "../routes/admin/prices.js";
import { adminRedemptionEnhancedRoutes } from "../routes/admin/redemption-enhanced/index.js";
import { redemptionUserRoutes } from "../routes/redemption-user.js";
import { agentRedemptionRoutes } from "../routes/agent/redemption.js";
import { agentFinanceRoutes } from "../routes/agent/finance.js";
import { adminEmailTemplateRoutes } from "../routes/admin/email-templates.js";
import { adminPageContentRoutes } from "../routes/admin/page-contents.js";
import { adminPerfCacheStatsRoutes } from "../routes/admin/perf-stats.js";
import { adminSiteSettingsRoutes } from "../routes/admin/site-settings.js";
import { quickConnectRoutes } from "../routes/quick-connect.js";
import { publicSiteConfigRoutes } from "../routes/public/site-config.js";
import { userTransactionRoutes } from "../routes/user-transactions.js";
import { userQuotaRoutes } from "../routes/user-quota.js";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // ── Auth 路由 ──
  await app.register(authRoutes, { prefix: "" });

  // ── API Key 管理 ──
  await app.register(apiKeyRoutes, { prefix: "" });

  // ── 厂商管理 ──
  await app.register(adminVendorRoutes, { prefix: "" });

  // ── 模型管理 ──
  await app.register(adminModelRoutes, { prefix: "" });

  // ── 厂商-模型关联管理 ──
  await app.register(adminVendorModelRoutes, { prefix: "" });
  await app.register(adminKeyGroupRoutes, { prefix: "" });
  await app.register(adminKeyModelPricesRoutes, { prefix: "" });
  await app.register(adminBatchRoutes, { prefix: "" });
  await app.register(adminContentFilterRoutes, { prefix: "" });
  await app.register(adminLogAnalysisRoutes, { prefix: "" });
  await app.register(playgroundRoutes, { prefix: "" });
  await app.register(adminTemplateRoutes, { prefix: "" });
  await app.register(adminUndoRoutes, { prefix: "" });

  // ── 公共模型列表 ──
  await app.register(modelListRoutes, { prefix: "" });

  // ── 调用日志 ──
  await app.register(logRoutes, { prefix: "" });

  // ── 充值系统 ──
  await app.register(rechargeRoutes, { prefix: "" });

  // ── Admin 用户管理 ──
  await app.register(adminUserRoutes, { prefix: "" });

  // ── Admin 实名审核 ──
  await app.register(adminReviewRoutes, { prefix: "" });

  // ── Admin API Key 管理 ──
  await app.register(adminApiKeyMgmtRoutes, { prefix: "" });

  // ── Admin 系统配置 ──
  await app.register(adminSystemRoutes, { prefix: "" });

  // ── Admin 实名文件查看 ──
  await app.register(realNameFileRoutes, { prefix: "" });

  // ── 通知中心（站内信） ──
  await app.register(notificationRoutes, { prefix: "" });

  // ── OCR 证件识别 ──
  await app.register(realNameOcrRoutes, { prefix: "" });

  // ── 用户端安全 ──
  await app.register(authSecurityRoutes, { prefix: "" });

  // ── Admin 公告管理 ──
  await app.register(adminAnnouncementRoutes, { prefix: "" });

  // ── 用户端公告 ──
  await app.register(announcementRoutes, { prefix: "" });

  // ── 发票管理（用户端）──
  await app.register(invoiceRoutes, { prefix: "" });

  // ── 退款申请（用户端）──
  await app.register(refundRoutes, { prefix: "" });

  // ── Admin 安全风控 ──
  await app.register(adminSecurityRoutes, { prefix: "" });

  // ── 用户偏好（筛选条件持久化）──
  await app.register(preferenceRoutes, { prefix: "" });

  // ── 代理商 ──
  await app.register(agentRoutes, { prefix: "" });

  // ── Admin 代理商管理 ──
  await app.register(adminAgentRoutes, { prefix: "" });

  // ── Admin 营销活动管理 ──
  await app.register(adminCampaignRoutes, { prefix: "" });

  // ── Admin Dashboard ──
  await app.register(adminDashboardRoutes, { prefix: "" });

  // ── Admin 调用日志 ──
  await app.register(adminLogRoutes, { prefix: "" });

  // ── Admin 财务管理 ──
  await app.register(adminFinanceRoutes, { prefix: "" });

  // ── Admin 财务成本核算 ──
  await app.register(adminFinanceCodeRoutes, { prefix: "" });

  // ── Admin 利润分析 ──
  await app.register(profitRoutes, { prefix: "" });

  // ── Admin 价格管理 ──
  await app.register(priceRoutes, { prefix: "" });

  // ── Admin 发票管理 ──
  await app.register(adminInvoiceRoutes, { prefix: "" });

  // ── Admin 退款管理 ──
  await app.register(adminRefundRoutes, { prefix: "" });

  // ── Admin 审计日志 ──
  await app.register(adminAuditLogRoutes, { prefix: "" });

  // ── 操作日志（用户端 + 管理端）──
  await app.register(userOperationLogRoutes, { prefix: "" });
  await app.register(adminOperationLogRoutes, { prefix: "" });

  // ── 管理 API Key 管理（admin_api_keys 表）──
  await app.register(adminKeyManagementRoutes, { prefix: "" });

  // ── 角色权限管理 ──
  await app.register(adminRoleRoutes, { prefix: "" });

  // ── 兑换码系统 ──
  await app.register(redemptionRoutes, { prefix: "" });

  // ── 用户端兑换码增强（未激活权益/活动列表）──
  await app.register(redemptionUserRoutes, { prefix: "" });

  // ── 兑换码转赠 ──
  await app.register(redemptionGiftRoutes, { prefix: "" });

  // ── Admin 代理钻取管理（兑换码）──
  await app.register(adminAgentRedemptionRoutes, { prefix: "" });

  // ── Admin 兑换码风控管理 ──
  await app.register(adminRedemptionFraudRoutes, { prefix: "" });

  // ── Admin 兑换码增强（批量操作/导出/风控/审计/报表）──
  await app.register(adminRedemptionEnhancedRoutes, { prefix: "" });

  // ── 供应商自助管理 ──
  await app.register(vendorSelfRoutes, { prefix: "" });

  // ── 供应商自助管理（JWT 鉴权，供门户使用）──
  await app.register(vendorJWTRoutes, { prefix: "" });

  // ── Admin 额度管理 ──
  await app.register(adminQuotaRoutes, { prefix: "" });

  // ── Admin TPM/RPM 限流管理 ──
  await app.register(adminRateLimitRoutes, { prefix: "" });

  // ── Admin 熔断器管理 ──
  await app.register(adminCircuitRoutes, { prefix: "" });

  // ── Admin 聚合统计 ──
  await app.register(adminStatsRoutes, { prefix: "" });

  // ── Admin 用量聚合统计（V2.0 新增）──
  await app.register(adminStatsUsageRoutes, { prefix: "" });

  // ── 用户端统计 & 额度 ──
  await app.register(meStatsRoutes, { prefix: "" });

  // ── 用户端用量聚合统计（V2.0 新增）──
  await app.register(statsUsageRoutes, { prefix: "" });

  // ── 代理端用量聚合统计（V2.0 新增）──
  await app.register(agentStatsUsageRoutes, { prefix: "" });

  // ── 代理端兑换码增强（模板/批量操作/导出/成本分析）──
  await app.register(agentRedemptionRoutes, { prefix: "" });

  // ── 代理端财务（结算单/资金流水）──
  await app.register(agentFinanceRoutes, { prefix: "" });

  // ── Admin 邮件模板管理 ──
  await app.register(adminEmailTemplateRoutes, { prefix: "" });

  // ── Admin 页面内容管理 ──
  await app.register(adminPageContentRoutes, { prefix: "" });

  // ── Admin 性能缓存统计 ──
  await app.register(adminPerfCacheStatsRoutes, { prefix: "" });

  // ── Admin 站点基础信息 ──
  await app.register(adminSiteSettingsRoutes, { prefix: "" });
  await app.register(quickConnectRoutes, { prefix: "" });

  // ── 公开站点配置（免认证）──
  await app.register(publicSiteConfigRoutes, { prefix: "" });

  // ── Token 代理 ──
  await app.register(userTransactionRoutes, { prefix: "" });
  await app.register(userQuotaRoutes, { prefix: "" });

  // -- Token 代理 --
  await app.register(proxyRoutes, { prefix: "" });

  // ── WebSocket 限流水位 ──
  const { rateLimitWsRoutes } = await import("../routes/rate-limit-ws.js");
  await app.register(rateLimitWsRoutes, { prefix: "" });
}
