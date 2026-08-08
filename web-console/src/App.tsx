import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/auth";
import { ToastProvider } from "@3cloud/shared-ui";
import LoginPage from "./pages/LoginPage";
import ConsoleLayout from "./layouts/ConsoleLayout";
import DashboardPage from "./pages/DashboardPage";
import ApiKeysPage from "./pages/ApiKeysPage";
import LogsPage from "./pages/LogsPage";
import RechargePage from "./pages/RechargePage";
import BillingPage from "./pages/BillingPage";
import InvoicesPage from "./pages/InvoicesPage";
import AgentSettingsPage from "./pages/AgentSettingsPage";
import AgentCommissionPage from "./pages/AgentCommissionPage";
import AgentConsumptionPage from "./pages/AgentConsumptionPage";
import AgentCustomersPage from "./pages/AgentCustomersPage";
import AgentDashboardPage from "./pages/AgentDashboardPage";
import AgentInvitePage from "./pages/AgentInvitePage";
import AgentRankingPage from "./pages/AgentRankingPage";
import AgentSettlementPage from "./pages/AgentSettlementPage";
import AgentWithdrawPage from "./pages/AgentWithdrawPage";
import AdminAffiliatePage from "./pages/AdminAffiliatePage";
import AdminAgentsPage from "./pages/AdminAgentsPage";
import AdminApikeySecurityPage from "./pages/AdminApikeySecurityPage";
import AdminWithdrawalsPage from "./pages/AdminWithdrawalsPage";
import AdminVendorsPage from "./pages/AdminVendorsPage";
import AdminI18nPage from "./pages/AdminI18nPage";
import AdminModelsPage from "./pages/AdminModelsPage";
import AdminNotificationPolicyPage from "./pages/AdminNotificationPolicyPage";
import AdminInvoicesPage from "./pages/AdminInvoicesPage";
import AdminRealNamePage from "./pages/AdminRealNamePage";
import RedemptionPage from "./pages/RedemptionPage";
import AnnouncementsPage from "./pages/AnnouncementsPage";
import AdminRedemptionPage from "./pages/AdminRedemptionPage";
import AdminAnnouncementsPage from "./pages/AdminAnnouncementsPage";
import RealNamePage from "./pages/RealNamePage";
import AdminEmailTemplatesPage from "./pages/AdminEmailTemplatesPage";
import AdminCampaignsPage from "./pages/AdminCampaignsPage";
import AdminActivityPage from "./pages/AdminActivityPage";
import NotificationPage from "./pages/NotificationPage";
import AdminVendorSettlementsPage from "./pages/AdminVendorSettlementsPage";
import AdminFinancePage from "./pages/AdminFinancePage";
import SecurityPage from "./pages/SecurityPage";
import TicketsPage from "./pages/TicketsPage";
import AdminTicketsPage from "./pages/AdminTicketsPage";
import AdminRolesPage from "./pages/AdminRolesPage";
import AdminUsersPermissionPage from "./pages/AdminUsersPermissionPage";
import AdminPerformancePage from "./pages/AdminPerformancePage";
import AdminPermissionAuditPage from "./pages/AdminPermissionAuditPage";
import AdminSupportPage from "./pages/AdminSupportPage";
import UserChatPage from "./pages/UserChatPage";
import AdminChatPage from "./pages/AdminChatPage";
import ConsentPage from "./pages/ConsentPage";
import AdminConsentPage from "./pages/AdminConsentPage";
import AdminContentModerationPage from "./pages/AdminContentModerationPage";
import AdminContentPage from "./pages/AdminContentPage";
import SalesCustomersPage from "./pages/SalesCustomersPage";
import SalesCustomerDetailPage from "./pages/SalesCustomerDetailPage";
import SalesRemindersPage from "./pages/SalesRemindersPage";
import SalesPerformancePage from "./pages/SalesPerformancePage";
import AdminCustomersPage from "./pages/AdminCustomersPage";
import AdminDataRequestPage from "./pages/AdminDataRequestPage";
import AdminDiscountEnginePage from "./pages/AdminDiscountEnginePage";
import AdminDisputePage from "./pages/AdminDisputePage";
import AdminCustomerDetailPage from "./pages/AdminCustomerDetailPage";
import AdminCreditPage from "./pages/AdminCreditPage";
import AdminManualRechargePage from "./pages/AdminManualRechargePage";
import AdminRechargeOrdersPage from "./pages/AdminRechargeOrdersPage";
import AdminRefundReviewPage from "./pages/AdminRefundReviewPage";
import AdminPricingPage from "./pages/AdminPricingPage";
import AdminCouponPage from "./pages/AdminCouponPage";
import AdminKnowledgeBasePage from "./pages/AdminKnowledgeBasePage";
import AdminWebhooksPage from "./pages/AdminWebhooksPage";
import HelpCenterPage from "./pages/HelpCenterPage";
import DeletionPage from "./pages/DeletionPage";
import NotificationSettingsPage from "./pages/NotificationSettingsPage";
import PlaygroundPage from "./pages/PlaygroundPage";
import TopupRecordsPage from "./pages/TopupRecordsPage";
import UserGroupsPage from "./pages/UserGroupsPage";
import UxDemoPage from "./pages/UxDemoPage";
import VendorSelectorPage from "./pages/VendorSelectorPage";
import UserWebhooksPage from "./pages/UserWebhooksPage";
import AdminDeletionPage from "./pages/AdminDeletionPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminCockpitPage from "./pages/AdminCockpitPage";
import AdminSysDbPage from "./pages/AdminSysDbPage";
import AdminSysCachePage from "./pages/AdminSysCachePage";
import AdminSysLogsPage from "./pages/AdminSysLogsPage";
import AdminSettingsPage from "./pages/AdminSettingsPage";
import AdminSubscriptionPage from "./pages/AdminSubscriptionPage";
import AdminSysVersionPage from "./pages/AdminSysVersionPage";
import AdminTaxBankingPage from "./pages/AdminTaxBankingPage";
import AdminUndoPage from "./pages/AdminUndoPage";
import AdminWebhookRetryPage from "./pages/AdminWebhookRetryPage";
import AdminSupplierListPage from "./pages/admin/AdminSupplierListPage";
import AdminSupplierDetailPage from "./pages/admin/AdminSupplierDetailPage";
import AdminModelServicePage from "./pages/admin/AdminModelServicePage";
import AdminVendorProfilesPage from "./pages/admin/AdminVendorProfilesPage";
import AdminVendorPricingPage from "./pages/admin/AdminVendorPricingPage";
import AdminVendorCostPage from "./pages/admin/AdminVendorCostPage";
import AdminVendorStatsPage from "./pages/admin/AdminVendorStatsPage";
import AdminVendorPerformancePage from "./pages/admin/AdminVendorPerformancePage";
import AdminMarketplacePage from "./pages/admin/AdminMarketplacePage";
import AdminMultimodalModelsPage from "./pages/admin/AdminMultimodalModelsPage";
import AdminPriceChangePage from "./pages/admin/AdminPriceChangePage";
import AdminRiskPage from "./pages/admin/AdminRiskPage";
import AdminRiskRulesPage from "./pages/admin/AdminRiskRulesPage";
import AdminRiskEventsPage from "./pages/admin/AdminRiskEventsPage";
import AdminAuditLogPage from "./pages/admin/AdminAuditLogPage";
import AdminConsumptionAnomalyPage from "./pages/admin/AdminConsumptionAnomalyPage";
import AdminConsumptionStreamPage from "./pages/admin/AdminConsumptionStreamPage";
import AdminConsumptionTrackingPage from "./pages/admin/AdminConsumptionTrackingPage";
import AdminSecurityIncidentPage from "./pages/admin/AdminSecurityIncidentPage";
import AdminSecurityIpBlacklistPage from "./pages/admin/AdminSecurityIpBlacklistPage";
import AdminBalanceAlertPage from "./pages/admin/AdminBalanceAlertPage";
import AdminOperatorDashboardPage from "./pages/admin/AdminOperatorDashboardPage";
import AdminOperationDiffPage from "./pages/admin/AdminOperationDiffPage";
import AdminConversionFunnelPage from "./pages/admin/AdminConversionFunnelPage";
import AdminCompetitiveMonitorPage from "./pages/admin/AdminCompetitiveMonitorPage";
import AdminCommissionFlowPage from "./pages/admin/AdminCommissionFlowPage";
import AdminSettlementPage from "./pages/admin/AdminSettlementPage";
import AdminReconciliationPage from "./pages/admin/AdminReconciliationPage";
import AdminReconciliationDiffPage from "./pages/admin/AdminReconciliationDiffPage";
import AdminProfitPage from "./pages/admin/AdminProfitPage";
import AdminCostDashboardPage from "./pages/admin/AdminCostDashboardPage";
import AdminCostPredictionPage from "./pages/admin/AdminCostPredictionPage";
import VendorLoginPage from "./pages/vendor/VendorLoginPage";
import VendorRegisterPage from "./pages/vendor/VendorRegisterPage";
import VendorLayout from "./layouts/VendorLayout";
import VendorDashboardPage from "./pages/vendor/VendorDashboardPage";
import VendorModelsPage from "./pages/vendor/VendorModelsPage";
import VendorStatsPage from "./pages/vendor/VendorStatsPage";
import VendorSettlementsPage from "./pages/vendor/VendorSettlementsPage";

/** 受保护路由：token 存在才允许访问 */
function Protected({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/** 首页按角色跳转 */
function DashboardRedirect() {
  const role = useAuthStore((s) => s.user?.role);
  const admin = role === "admin" || role === "super_admin";
  return admin ? <Navigate to="/admin/dashboard" replace /> : <DashboardPage />;
}

export default function App() {
  const token = useAuthStore((s) => s.token);
  const fetchMe = useAuthStore((s) => s.fetchMe);

  useEffect(() => {
    if (token) fetchMe();
  }, [token, fetchMe]);

  return (
    <ToastProvider>
    <Routes>
      {/* 供应商自助端（独立于 Console） */}
      <Route path="/vendor/login" element={<VendorLoginPage />} />
      <Route path="/vendor/register" element={<VendorRegisterPage />} />
      <Route path="/vendor" element={<VendorLayout />}>
        <Route index element={<VendorDashboardPage />} />
        <Route path="models" element={<VendorModelsPage />} />
        <Route path="stats" element={<VendorStatsPage />} />
        <Route path="settlements" element={<VendorSettlementsPage />} />
      </Route>

      <Route path="/ux-demo" element={<UxDemoPage />} />
      <Route path="/login" element={token ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <ConsoleLayout />
          </Protected>
        }
      >
        <Route index element={<DashboardRedirect />} />
        <Route path="api-keys" element={<ApiKeysPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="recharge" element={<RechargePage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="agent/settings" element={<AgentSettingsPage />} />
        <Route path="agent/settlements" element={<AgentSettlementPage />} />
        <Route path="agent/dashboard" element={<AgentDashboardPage />} />
        <Route path="agent/commission" element={<AgentCommissionPage />} />
        <Route path="agent/consumption" element={<AgentConsumptionPage />} />
        <Route path="agent/customers" element={<AgentCustomersPage />} />
        <Route path="agent/invite" element={<AgentInvitePage />} />
        <Route path="agent/ranking" element={<AgentRankingPage />} />
        <Route path="agent/withdraw" element={<AgentWithdrawPage />} />
        <Route path="admin/dashboard" element={<AdminDashboardPage />} />
        <Route path="admin/cockpit" element={<AdminCockpitPage />} />
        <Route path="admin/agents" element={<AdminAgentsPage />} />
        <Route path="admin/withdrawals" element={<AdminWithdrawalsPage />} />
        <Route path="admin/vendors" element={<AdminVendorsPage />} />
        <Route path="admin/models" element={<AdminModelsPage />} />
        <Route path="admin/invoices" element={<AdminInvoicesPage />} />
        <Route path="admin/real-name" element={<AdminRealNamePage />} />
        <Route path="redemption" element={<RedemptionPage />} />
        <Route path="help" element={<HelpCenterPage />} />
        <Route path="account-deletion" element={<DeletionPage />} />
        <Route path="announcements" element={<AnnouncementsPage />} />
        <Route path="real-name" element={<RealNamePage />} />
        <Route path="admin/redemption" element={<AdminRedemptionPage />} />
        <Route path="admin/announcements" element={<AdminAnnouncementsPage />} />
        <Route path="admin/email-templates" element={<AdminEmailTemplatesPage />} />
        <Route path="admin/campaigns" element={<AdminCampaignsPage />} />
        <Route path="admin/activity" element={<AdminActivityPage />} />
        <Route path="notification" element={<NotificationPage />} />
        <Route path="settings/notifications" element={<NotificationSettingsPage />} />
        <Route path="playground" element={<PlaygroundPage />} />
        <Route path="webhooks" element={<UserWebhooksPage />} />
        <Route path="admin/vendor-settlements" element={<AdminVendorSettlementsPage />} />
<Route path="admin/finance" element={<AdminFinancePage />} />
<Route path="security" element={<SecurityPage />} />
<Route path="tickets" element={<TicketsPage />} />
<Route path="admin/tickets" element={<AdminTicketsPage />} />
<Route path="admin/support" element={<AdminSupportPage />} />
<Route path="chat" element={<UserChatPage />} />
<Route path="admin/chat" element={<AdminChatPage />} />
<Route path="data-export" element={<ConsentPage />} />
<Route path="admin/consent" element={<AdminConsentPage />} />
<Route path="admin/roles" element={<AdminRolesPage />} />
<Route path="admin/users-permission" element={<AdminUsersPermissionPage />} />
<Route path="admin/permission-audit" element={<AdminPermissionAuditPage />} />
<Route path="sales/customers" element={<SalesCustomersPage />} />
<Route path="sales/customers/:userId" element={<SalesCustomerDetailPage />} />
<Route path="sales/reminders" element={<SalesRemindersPage />} />
<Route path="sales/performance" element={<SalesPerformancePage />} />
<Route path="admin/customers" element={<AdminCustomersPage />} />
<Route path="admin/customers/:userId" element={<AdminCustomerDetailPage />} />
<Route path="admin/credit" element={<AdminCreditPage />} />
<Route path="admin/manual-recharge" element={<AdminManualRechargePage />} />
<Route path="admin/recharge-orders" element={<AdminRechargeOrdersPage />} />
<Route path="admin/refunds" element={<AdminRefundReviewPage />} />
<Route path="admin/pricing" element={<AdminPricingPage />} />
<Route path="admin/coupons" element={<AdminCouponPage />} />
<Route path="admin/deletion" element={<AdminDeletionPage />} />
<Route path="admin/knowledge-base" element={<AdminKnowledgeBasePage />} />
<Route path="admin/webhooks" element={<AdminWebhooksPage />} />
<Route path="admin/sys/db" element={<AdminSysDbPage />} />
<Route path="admin/sys/cache" element={<AdminSysCachePage />} />
<Route path="admin/sys/logs" element={<AdminSysLogsPage />} />
<Route path="admin/sys/version" element={<AdminSysVersionPage />} />
        {/* ── 供应商管理 ── */}
        <Route path="admin/suppliers" element={<AdminSupplierListPage />} />
        <Route path="admin/suppliers/:id" element={<AdminSupplierDetailPage />} />
        <Route path="admin/model-services" element={<AdminModelServicePage />} />
        <Route path="admin/vendor-profiles" element={<AdminVendorProfilesPage />} />
        <Route path="admin/vendor-pricing" element={<AdminVendorPricingPage />} />
        <Route path="admin/vendor-costs" element={<AdminVendorCostPage />} />
        <Route path="admin/vendor-stats" element={<AdminVendorStatsPage />} />
        <Route path="admin/vendor-performance" element={<AdminVendorPerformancePage />} />
        <Route path="admin/marketplace" element={<AdminMarketplacePage />} />
        <Route path="admin/multimodal-models" element={<AdminMultimodalModelsPage />} />
        <Route path="admin/price-changes" element={<AdminPriceChangePage />} />
        {/* ── 风控与审计 ── */}
        <Route path="admin/risk" element={<AdminRiskPage />} />
        <Route path="admin/risk/rules" element={<AdminRiskRulesPage />} />
        <Route path="admin/risk/events" element={<AdminRiskEventsPage />} />
        <Route path="admin/audit-logs" element={<AdminAuditLogPage />} />
        <Route path="admin/consumption/anomalies" element={<AdminConsumptionAnomalyPage />} />
        <Route path="admin/consumption/stream" element={<AdminConsumptionStreamPage />} />
        <Route path="admin/consumption/tracking" element={<AdminConsumptionTrackingPage />} />
        <Route path="admin/security/incidents" element={<AdminSecurityIncidentPage />} />
        <Route path="admin/security/ip-blacklist" element={<AdminSecurityIpBlacklistPage />} />
        <Route path="admin/balance-alerts" element={<AdminBalanceAlertPage />} />
        {/* ── 运营分析 ── */}
        <Route path="admin/operator/dashboard" element={<AdminOperatorDashboardPage />} />
        <Route path="admin/operator/diff" element={<AdminOperationDiffPage />} />
        <Route path="admin/conversion/funnel" element={<AdminConversionFunnelPage />} />
        <Route path="admin/competitive/monitor" element={<AdminCompetitiveMonitorPage />} />
        <Route path="admin/commission/flow" element={<AdminCommissionFlowPage />} />
        <Route path="admin/settlement" element={<AdminSettlementPage />} />
        <Route path="admin/reconciliation" element={<AdminReconciliationPage />} />
        <Route path="admin/reconciliation/diffs" element={<AdminReconciliationDiffPage />} />
        <Route path="admin/profit" element={<AdminProfitPage />} />
        <Route path="admin/cost/dashboard" element={<AdminCostDashboardPage />} />
        <Route path="admin/cost/prediction" element={<AdminCostPredictionPage />} />
        {/* ── Module F: 系统管理 ── */}
        <Route path="admin/settings" element={<AdminSettingsPage />} />
        <Route path="admin/i18n" element={<AdminI18nPage />} />
        <Route path="admin/undo" element={<AdminUndoPage />} />
        <Route path="admin/data-requests" element={<AdminDataRequestPage />} />
        <Route path="admin/subscriptions" element={<AdminSubscriptionPage />} />
        <Route path="admin/affiliate" element={<AdminAffiliatePage />} />
        <Route path="admin/content" element={<AdminContentPage />} />
        <Route path="admin/content-moderation" element={<AdminContentModerationPage />} />
        <Route path="admin/notification-policies" element={<AdminNotificationPolicyPage />} />
        <Route path="admin/tax-banking" element={<AdminTaxBankingPage />} />
        <Route path="admin/discount-rules" element={<AdminDiscountEnginePage />} />
        <Route path="admin/disputes" element={<AdminDisputePage />} />
        <Route path="admin/webhook-retry" element={<AdminWebhookRetryPage />} />
        <Route path="admin/performance" element={<AdminPerformancePage />} />
        <Route path="admin/apikey-security" element={<AdminApikeySecurityPage />} />
        {/* ── Module I: 用户门户补齐 ── */}
        <Route path="topup-records" element={<TopupRecordsPage />} />
        <Route path="user-groups" element={<UserGroupsPage />} />
        <Route path="vendor-selector" element={<VendorSelectorPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </ToastProvider>
  );
}
