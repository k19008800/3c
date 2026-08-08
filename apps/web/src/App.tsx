import { Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/portal/Dashboard";
import Billing from "./pages/portal/Billing";
import ApiKeys from "./pages/portal/ApiKeys";
import Playground from "./pages/portal/Playground";
import Consumption from "./pages/portal/Consumption";
import Profile from "./pages/portal/Profile";
import Security from "./pages/portal/Security";
import Notifications from "./pages/portal/Notifications";
import Invoices from "./pages/portal/Invoices";
import Recharge from "./pages/portal/Recharge";
import Tickets from "./pages/portal/Tickets";
import Team from "./pages/portal/Team";
import Webhooks from "./pages/portal/Webhooks";
import Logs from "./pages/portal/Logs";
import Settings from "./pages/portal/Settings";
import AccountDeletion from "./pages/portal/AccountDeletion";

// Agent pages
import AgentDashboard from "./pages/agent/AgentDashboard";
import AgentCustomers from "./pages/agent/AgentCustomers";
import AgentConsumption from "./pages/agent/AgentConsumption";
import AgentCommission from "./pages/agent/AgentCommission";
import AgentWithdraw from "./pages/agent/AgentWithdraw";

// ── Admin pages (Group 1) ──
import AdminLayout from "./components/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminCustomers from "./pages/admin/AdminCustomers";
import AdminFinance from "./pages/admin/AdminFinance";
import AdminSupplier from "./pages/admin/AdminSupplier";
import AdminAgent from "./pages/admin/AdminAgent";
import AdminTickets from "./pages/admin/AdminTickets";
import AdminSettings from "./pages/admin/AdminSettings";

// ── Admin pages (Group 2: 配置管理) ──
import AdminCockpit from "./pages/admin/AdminCockpit";
import AdminModelService from "./pages/admin/AdminModelService";
import AdminRoles from "./pages/admin/AdminRoles";
import AdminEmailTemplates from "./pages/admin/AdminEmailTemplates";
import AdminOps from "./pages/admin/AdminOps";
import AdminRisk from "./pages/admin/AdminRisk";
import AdminCoupon from "./pages/admin/AdminCoupon";
import AdminContent from "./pages/admin/AdminContent";

// ── Admin pages (Group 3: 运营管理类 12 页) ──
import AdminReconciliation from "./pages/admin/AdminReconciliation";
import AdminConsumptionStream from "./pages/admin/AdminConsumptionStream";
import AdminAnomaly from "./pages/admin/AdminAnomaly";
import AdminBalanceAlert from "./pages/admin/AdminBalanceAlert";
import AdminSupplierBillMatch from "./pages/admin/AdminSupplierBillMatch";
import AdminCustomerLifecycle from "./pages/admin/AdminCustomerLifecycle";
import AdminSubscription from "./pages/admin/AdminSubscription";
import AdminCostPrediction from "./pages/admin/AdminCostPrediction";
import AdminVendorPricing from "./pages/admin/AdminVendorPricing";
import AdminVendorCost from "./pages/admin/AdminVendorCost";
import AdminVendorStats from "./pages/admin/AdminVendorStats";
import AdminDispute from "./pages/admin/AdminDispute";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      {/* Group 1: 核心功能 */}
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/billing" element={<Billing />} />
      <Route path="/api-keys" element={<ApiKeys />} />
      <Route path="/playground" element={<Playground />} />
      <Route path="/consumption" element={<Consumption />} />
      {/* Group 2: 账户相关 */}
      <Route path="/profile" element={<Profile />} />
      <Route path="/security" element={<Security />} />
      <Route path="/notifications" element={<Notifications />} />
      <Route path="/invoices" element={<Invoices />} />
      <Route path="/recharge" element={<Recharge />} />
      <Route path="/tickets" element={<Tickets />} />
      {/* Group 3: 高级功能 */}
      <Route path="/team" element={<Team />} />
      <Route path="/webhooks" element={<Webhooks />} />
      <Route path="/logs" element={<Logs />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/account-deletion" element={<AccountDeletion />} />
      {/* Agent 代理商 */}
      <Route path="/agent/dashboard" element={<AgentDashboard />} />
      <Route path="/agent/customers" element={<AgentCustomers />} />
      <Route path="/agent/consumption" element={<AgentConsumption />} />
      <Route path="/agent/commission" element={<AgentCommission />} />
      <Route path="/agent/withdraw" element={<AgentWithdraw />} />
      {/* ── Admin 运营后台 Group 1 ── */}
      <Route path="/admin" element={<AdminLayout><AdminDashboard /></AdminLayout>} />
      <Route path="/admin/dashboard" element={<AdminLayout><AdminDashboard /></AdminLayout>} />
      <Route path="/admin/customers" element={<AdminLayout><AdminCustomers /></AdminLayout>} />
      <Route path="/admin/finance" element={<AdminLayout><AdminFinance /></AdminLayout>} />
      <Route path="/admin/supplier" element={<AdminLayout><AdminSupplier /></AdminLayout>} />
      <Route path="/admin/agent" element={<AdminLayout><AdminAgent /></AdminLayout>} />
      <Route path="/admin/tickets" element={<AdminLayout><AdminTickets /></AdminLayout>} />
      <Route path="/admin/settings" element={<AdminLayout><AdminSettings /></AdminLayout>} />
      {/* ── Admin 运营后台 Group 2: 配置管理 ── */}
      <Route path="/admin/model-service" element={<AdminModelService />} />
      <Route path="/admin/cockpit" element={<AdminCockpit />} />
      <Route path="/admin/roles" element={<AdminRoles />} />
      <Route path="/admin/email-templates" element={<AdminEmailTemplates />} />
      <Route path="/admin/ops" element={<AdminOps />} />
      <Route path="/admin/risk" element={<AdminRisk />} />
      <Route path="/admin/coupon" element={<AdminCoupon />} />
      <Route path="/admin/content" element={<AdminContent />} />
      {/* ── Admin 运营后台 Group 3: 运营管理类 (12 页, 自含 AdminLayout) ── */}
      <Route path="/admin/reconciliation" element={<AdminReconciliation />} />
      <Route path="/admin/consumption-stream" element={<AdminConsumptionStream />} />
      <Route path="/admin/anomaly" element={<AdminAnomaly />} />
      <Route path="/admin/balance-alert" element={<AdminBalanceAlert />} />
      <Route path="/admin/supplier-bill-match" element={<AdminSupplierBillMatch />} />
      <Route path="/admin/customer-lifecycle" element={<AdminCustomerLifecycle />} />
      <Route path="/admin/subscription" element={<AdminSubscription />} />
      <Route path="/admin/cost-prediction" element={<AdminCostPrediction />} />
      <Route path="/admin/vendor-pricing" element={<AdminVendorPricing />} />
      <Route path="/admin/vendor-cost" element={<AdminVendorCost />} />
      <Route path="/admin/vendor-stats" element={<AdminVendorStats />} />
      <Route path="/admin/dispute" element={<AdminDispute />} />
    </Routes>
  );
}
