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
        <Route path="admin/agents" element={<AdminAgentsPage />} />
        <Route path="admin/withdrawals" element={<AdminWithdrawalsPage />} />
        <Route path="admin/vendors" element={<AdminVendorsPage />} />
        <Route path="admin/models" element={<AdminModelsPage />} />
        <Route path="admin/invoices" element={<AdminInvoicesPage />} />
        <Route path="admin/real-name" element={<AdminRealNamePage />} />
        <Route path="redemption" element={<RedemptionPage />} />
        <Route path="announcements" element={<AnnouncementsPage />} />
        <Route path="real-name" element={<RealNamePage />} />
        <Route path="admin/redemption" element={<AdminRedemptionPage />} />
        <Route path="admin/announcements" element={<AdminAnnouncementsPage />} />
        <Route path="admin/email-templates" element={<AdminEmailTemplatesPage />} />
        <Route path="admin/campaigns" element={<AdminCampaignsPage />} />
        <Route path="admin/activity" element={<AdminActivityPage />} />
        <Route path="notification" element={<NotificationPage />} />
        <Route path="admin/vendor-settlements" element={<AdminVendorSettlementsPage />} />
<Route path="admin/finance" element={<AdminFinancePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
