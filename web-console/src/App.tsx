import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/auth";
import LoginPage from "./pages/LoginPage";
import ConsoleLayout from "./layouts/ConsoleLayout";
import DashboardPage from "./pages/DashboardPage";
import ApiKeysPage from "./pages/ApiKeysPage";
import LogsPage from "./pages/LogsPage";
import RechargePage from "./pages/RechargePage";
import BillingPage from "./pages/BillingPage";
import InvoicesPage from "./pages/InvoicesPage";
import AgentSettingsPage from "./pages/AgentSettingsPage";
import AgentSettlementPage from "./pages/AgentSettlementPage";
import AdminAgentsPage from "./pages/AdminAgentsPage";
import AdminWithdrawalsPage from "./pages/AdminWithdrawalsPage";
import AdminVendorsPage from "./pages/AdminVendorsPage";
import AdminModelsPage from "./pages/AdminModelsPage";
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
import AdminPermissionAuditPage from "./pages/AdminPermissionAuditPage";
import AdminSupportPage from "./pages/AdminSupportPage";
import UserChatPage from "./pages/UserChatPage";
import AdminChatPage from "./pages/AdminChatPage";
import ConsentPage from "./pages/ConsentPage";
import AdminConsentPage from "./pages/AdminConsentPage";
import SalesCustomersPage from "./pages/SalesCustomersPage";
import SalesCustomerDetailPage from "./pages/SalesCustomerDetailPage";
import SalesRemindersPage from "./pages/SalesRemindersPage";
import SalesPerformancePage from "./pages/SalesPerformancePage";
import AdminCustomersPage from "./pages/AdminCustomersPage";
import AdminKnowledgeBasePage from "./pages/AdminKnowledgeBasePage";
import AdminWebhooksPage from "./pages/AdminWebhooksPage";
import HelpCenterPage from "./pages/HelpCenterPage";
import DeletionPage from "./pages/DeletionPage";
import NotificationSettingsPage from "./pages/NotificationSettingsPage";
import PlaygroundPage from "./pages/PlaygroundPage";
import AdminDeletionPage from "./pages/AdminDeletionPage";
import AdminSysDbPage from "./pages/AdminSysDbPage";
import AdminSysCachePage from "./pages/AdminSysCachePage";
import AdminSysLogsPage from "./pages/AdminSysLogsPage";
import AdminSysVersionPage from "./pages/AdminSysVersionPage";
import VendorLoginPage from "./pages/vendor/VendorLoginPage";
import VendorRegisterPage from "./pages/vendor/VendorRegisterPage";
import VendorLayout from "./layouts/VendorLayout";
import VendorDashboardPage from "./pages/vendor/VendorDashboardPage";
import VendorModelsPage from "./pages/vendor/VendorModelsPage";
import VendorStatsPage from "./pages/vendor/VendorStatsPage";
import VendorSettlementsPage from "./pages/vendor/VendorSettlementsPage";

/** 受保护路由：token 存在才允许访问 */
function Protected({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const token = useAuthStore((s) => s.token);
  const fetchMe = useAuthStore((s) => s.fetchMe);

  useEffect(() => {
    if (token) fetchMe();
  }, [token, fetchMe]);

  return (
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

      <Route path="/login" element={token ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <ConsoleLayout />
          </Protected>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="api-keys" element={<ApiKeysPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="recharge" element={<RechargePage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="agent/settings" element={<AgentSettingsPage />} />
        <Route path="agent/settlements" element={<AgentSettlementPage />} />
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
<Route path="admin/deletion" element={<AdminDeletionPage />} />
<Route path="admin/knowledge-base" element={<AdminKnowledgeBasePage />} />
<Route path="admin/webhooks" element={<AdminWebhooksPage />} />
<Route path="admin/sys/db" element={<AdminSysDbPage />} />
<Route path="admin/sys/cache" element={<AdminSysCachePage />} />
<Route path="admin/sys/logs" element={<AdminSysLogsPage />} />
<Route path="admin/sys/version" element={<AdminSysVersionPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
