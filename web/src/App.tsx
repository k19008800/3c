import { Suspense, lazy } from 'react'
import type { JSX } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/hooks/use-auth'
import { ImpersonateProvider } from '@/hooks/use-impersonate'
import AppLayout from '@/components/layout/AppLayout'
import PublicLayout from '@/components/portal/PublicLayout'
import AdminRoute from '@/components/layout/AdminRoute'
import VendorRoute from '@/components/layout/VendorRoute'
import VendorLayout from '@/components/layout/VendorLayout'
import ErrorBoundary from '@/components/ErrorBoundary'

// ── 门户公开页面 ──
const PortalHome = lazy(() => import('@/pages/portal/Home'))
const PortalPricing = lazy(() => import('@/pages/portal/Pricing'))
const PortalDocs = lazy(() => import('@/pages/portal/Docs'))
const PortalModels = lazy(() => import('@/pages/portal/Models'))

// ── 公共页面 ──
const Login = lazy(() => import('@/pages/Login'))
const Register = lazy(() => import('@/pages/Register'))
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'))
const ResetPassword = lazy(() => import('@/pages/ResetPassword'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Models = lazy(() => import('@/pages/Models'))
const ApiKeys = lazy(() => import('@/pages/ApiKeys'))
const Logs = lazy(() => import('@/pages/Logs'))
const Recharge = lazy(() => import('@/pages/Recharge'))
const RealName = lazy(() => import('@/pages/RealName'))
const Redemption = lazy(() => import('@/pages/Redemption'))
const Docs = lazy(() => import('@/pages/Docs'))
const Security = lazy(() => import('@/pages/Security'))
const Stats = lazy(() => import('@/pages/Stats'))
const Notifications = lazy(() => import('@/pages/Notifications'))
const Announcements = lazy(() => import('@/pages/Announcements'))
const Settings = lazy(() => import('@/pages/Settings'))
const OperationLogs = lazy(() => import('@/pages/OperationLogs'))
const Transactions = lazy(() => import('@/pages/Transactions'))

// ── Admin 页面 ──
const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'))
const AdminUsers = lazy(() => import('@/pages/admin/Users'))
const AdminModels = lazy(() => import('@/pages/admin/AdminModels'))
const AdminVendors = lazy(() => import('@/pages/admin/Vendors'))
const AdminVendorKeyGroups = lazy(() => import('@/pages/admin/VendorKeyGroups'))
const AdminVendorModels = lazy(() => import('@/pages/admin/VendorModels'))
const AdminAgents = lazy(() => import('@/pages/admin/Agents'))
const AdminAgentDetail = lazy(() => import('@/pages/admin/AgentDetail'))
const AdminLogs = lazy(() => import('@/pages/admin/AdminLogs'))
const AdminRechargeOrders = lazy(() => import('@/pages/admin/RechargeOrders'))
const AdminConfigs = lazy(() => import('@/pages/admin/Configs'))
const AdminRealNameReview = lazy(() => import('@/pages/admin/RealNameReview'))
const AdminAuditLogs = lazy(() => import('@/pages/admin/AuditLogs'))
const AdminOperationLogs = lazy(() => import('@/pages/admin/OperationLogs'))
const AdminAgentClients = lazy(() => import('@/pages/admin/AgentClients'))
const AdminFinanceDashboard = lazy(() => import('@/pages/admin/FinanceDashboard'))
const AdminFinanceCommissions = lazy(() => import('@/pages/admin/FinanceCommissions'))
const AdminFinanceReconciliation = lazy(() => import('@/pages/admin/FinanceReconciliation'))
const AdminCodeCostDashboard = lazy(() => import('@/pages/admin/finance/CodeCostDashboard'))
const AdminAgentCostDetail = lazy(() => import('@/pages/admin/finance/AgentCostDetail'))
const AdminAdminCostDetail = lazy(() => import('@/pages/admin/finance/AdminCostDetail'))
const AdminAgentSettlement = lazy(() => import('@/pages/admin/finance/AgentSettlement'))
const AdminWithdraws = lazy(() => import('@/pages/admin/Withdraws'))
const AdminSecurityDashboard = lazy(() => import('@/pages/admin/SecurityDashboard'))
const AdminSecurityConfig = lazy(() => import('@/pages/admin/SecurityConfig'))
const AdminSecurityEvents = lazy(() => import('@/pages/admin/SecurityEvents'))
const AdminSecurityBans = lazy(() => import('@/pages/admin/SecurityBans'))
const AdminSecurityAlerts = lazy(() => import('@/pages/admin/SecurityAlerts'))
const AdminSecurityAutoRules = lazy(() => import('@/pages/admin/SecurityAutoRules'))
const AdminEmailTemplates = lazy(() => import('@/pages/admin/EmailTemplates'))
const AdminEnterpriseAnalysis = lazy(() => import('@/pages/admin/EnterpriseAnalysis'))
const AdminCircuitBreakers = lazy(() => import('@/pages/admin/CircuitBreakers'))
const AdminStats = lazy(() => import('@/pages/admin/Stats'))
const AdminAnnouncements = lazy(() => import('@/pages/admin/Announcements'))
const AdminRedemptionCodes = lazy(() => import('@/pages/admin/RedemptionCodes'))
const AdminApiKeys = lazy(() => import('@/pages/admin/AdminApiKeys'))
const AdminQuotas = lazy(() => import('@/pages/admin/Quotas'))
const AdminRateLimits = lazy(() => import('@/pages/admin/RateLimits'))
const AdminRoles = lazy(() => import('@/pages/admin/Roles'))
const AdminCampaigns = lazy(() => import('@/pages/admin/Campaigns'))
const AdminSystemHealthPanel = lazy(() => import('@/pages/admin/SystemHealthPanel'))
const AdminCampaignDetail = lazy(() => import('@/pages/admin/CampaignDetail'))
const AdminPlayground = lazy(() => import('@/pages/admin/Playground'))
const AdminPageContents = lazy(() => import('@/pages/admin/PageContents'))
const AdminProfitAnalysis = lazy(() => import('@/pages/admin/ProfitAnalysis'))
const AdminSiteSettings = lazy(() => import('@/pages/admin/SiteSettings'))
const AdminVendorSelfMgmt = lazy(() => import('@/pages/admin/VendorSelfMgmt'))
const AdminPrices = lazy(() => import('@/pages/admin/finance/Prices'))
const AdminInvoices = lazy(() => import('@/pages/admin/finance/Invoices'))
const AdminRefunds = lazy(() => import('@/pages/admin/finance/Refunds'))

// ── 用户端财务 ──
const UserInvoices = lazy(() => import('@/pages/finance/Invoices'))
const UserRefunds = lazy(() => import('@/pages/finance/Refunds'))

// ── Agent 页面 ──
const AgentDashboard = lazy(() => import('@/pages/agent/Dashboard'))
const AgentClients = lazy(() => import('@/pages/agent/Clients'))
const AgentCommissions = lazy(() => import('@/pages/agent/Commissions'))
const AgentWithdraw = lazy(() => import('@/pages/agent/Withdraw'))
const AgentRedemption = lazy(() => import('@/pages/agent/Redemption'))
const AgentFinance = lazy(() => import('@/pages/agent/Finance'))
const AgentReconciliation = lazy(() => import('@/pages/agent/Reconciliation'))

// ── Vendor 页面 ──
const VendorLogin = lazy(() => import('@/pages/vendor/VendorLogin'))
const VendorRegister = lazy(() => import('@/pages/vendor/VendorRegister'))
const VendorRegisterSuccess = lazy(() => import('@/pages/vendor/VendorRegisterSuccess'))
const VendorDashboard = lazy(() => import('@/pages/vendor/VendorDashboard'))

// ── Loading 占位 ──
function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}

function withSuspense(el: JSX.Element) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>{el}</Suspense>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ImpersonateProvider>
        <Routes>
          {/* ── 公开门户页面 (无需登录) ── */}
          <Route element={withSuspense(<PublicLayout />)}>
            <Route index element={withSuspense(<PortalHome />)} />
            <Route path="pricing" element={withSuspense(<PortalPricing />)} />
            <Route path="docs" element={withSuspense(<PortalDocs />)} />
            <Route path="models" element={withSuspense(<PortalModels />)} />
          </Route>

          {/* ── 认证页面 (无布局) ── */}
          <Route path="/login" element={withSuspense(<Login />)} />
          <Route path="/register" element={withSuspense(<Register />)} />
          <Route path="/forgot-password" element={withSuspense(<ForgotPassword />)} />
          <Route path="/reset-password" element={withSuspense(<ResetPassword />)} />

          {/* ── 认证控制台 (需登录) ── */}
          <Route path="/console" element={<AppLayout />}>
            <Route index element={withSuspense(<Dashboard />)} />
            <Route path="models" element={withSuspense(<Models />)} />
            <Route path="api-keys" element={withSuspense(<ApiKeys />)} />
            <Route path="logs" element={withSuspense(<Logs />)} />
            <Route path="operation-logs" element={withSuspense(<OperationLogs />)} />
            <Route path="transactions" element={withSuspense(<Transactions />)} />
            <Route path="recharge" element={withSuspense(<Recharge />)} />
            <Route path="real-name" element={withSuspense(<RealName />)} />
            <Route path="redemption" element={withSuspense(<Redemption />)} />
            <Route path="docs" element={withSuspense(<Docs />)} />

            {/* Admin routes — guarded by AdminRoute */}
            <Route element={<AdminRoute />}>
              <Route path="admin" element={withSuspense(<AdminDashboard />)} />
              <Route path="admin/users" element={withSuspense(<AdminUsers />)} />
              <Route path="admin/models" element={withSuspense(<AdminModels />)} />
              <Route path="admin/vendors" element={withSuspense(<AdminVendors />)} />
              <Route path="admin/vendor-key-groups" element={withSuspense(<AdminVendorKeyGroups />)} />
              <Route path="admin/vendor-models" element={withSuspense(<AdminVendorModels />)} />
              <Route path="admin/agents" element={withSuspense(<AdminAgents />)} />
              <Route path="admin/agents/:agentId/detail" element={withSuspense(<AdminAgentDetail />)} />
              <Route path="admin/logs" element={withSuspense(<AdminLogs />)} />
              <Route path="admin/recharge-orders" element={withSuspense(<AdminRechargeOrders />)} />
              <Route path="admin/real-name-review" element={withSuspense(<AdminRealNameReview />)} />
              <Route path="admin/configs" element={withSuspense(<AdminConfigs />)} />
              <Route path="admin/email-templates" element={withSuspense(<AdminEmailTemplates />)} />
              <Route path="admin/audit-logs" element={withSuspense(<AdminAuditLogs />)} />
              <Route path="admin/operation-logs" element={withSuspense(<AdminOperationLogs />)} />
              <Route path="admin/system-health" element={withSuspense(<AdminSystemHealthPanel />)} />
              <Route path="admin/agents/:agentId/clients" element={withSuspense(<AdminAgentClients />)} />
              <Route path="admin/finance/dashboard" element={withSuspense(<AdminFinanceDashboard />)} />
              <Route path="admin/finance/commissions" element={withSuspense(<AdminFinanceCommissions />)} />
              <Route path="admin/finance/reconciliation" element={withSuspense(<AdminFinanceReconciliation />)} />
              <Route path="admin/finance/code-cost" element={withSuspense(<AdminCodeCostDashboard />)} />
              <Route path="admin/finance/agent-cost" element={withSuspense(<AdminAgentCostDetail />)} />
              <Route path="admin/finance/admin-cost" element={withSuspense(<AdminAdminCostDetail />)} />
              <Route path="admin/finance/settlement" element={withSuspense(<AdminAgentSettlement />)} />
              <Route path="admin/finance/profit-analysis" element={withSuspense(<AdminProfitAnalysis />)} />
              <Route path="admin/finance/prices" element={withSuspense(<AdminPrices />)} />
              <Route path="admin/finance/invoices" element={withSuspense(<AdminInvoices />)} />
              <Route path="admin/finance/refunds" element={withSuspense(<AdminRefunds />)} />
              <Route path="admin/withdraws" element={withSuspense(<AdminWithdraws />)} />
              <Route path="admin/security" element={withSuspense(<AdminSecurityDashboard />)} />
              <Route path="admin/security/events" element={withSuspense(<AdminSecurityEvents />)} />
              <Route path="admin/security/config" element={withSuspense(<AdminSecurityConfig />)} />
              <Route path="admin/security/bans" element={withSuspense(<AdminSecurityBans />)} />
              <Route path="admin/security/alerts" element={withSuspense(<AdminSecurityAlerts />)} />
              <Route path="admin/security/auto-rules" element={withSuspense(<AdminSecurityAutoRules />)} />
              <Route path="admin/enterprise-analysis" element={withSuspense(<AdminEnterpriseAnalysis />)} />
              <Route path="admin/circuit-breakers" element={withSuspense(<AdminCircuitBreakers />)} />
              <Route path="admin/stats" element={withSuspense(<AdminStats />)} />
              <Route path="admin/announcements" element={withSuspense(<AdminAnnouncements />)} />
              <Route path="admin/redemption-codes" element={withSuspense(<AdminRedemptionCodes />)} />
              <Route path="admin/admin-api-keys" element={withSuspense(<AdminApiKeys />)} />
              <Route path="admin/quotas" element={withSuspense(<AdminQuotas />)} />
              <Route path="admin/rate-limits" element={withSuspense(<AdminRateLimits />)} />
              <Route path="admin/roles" element={withSuspense(<AdminRoles />)} />
              <Route path="admin/campaigns" element={withSuspense(<AdminCampaigns />)} />
              <Route path="admin/campaigns/:id" element={withSuspense(<AdminCampaignDetail />)} />
              <Route path="admin/vendor-self" element={withSuspense(<AdminVendorSelfMgmt />)} />
              <Route path="admin/page-contents" element={withSuspense(<AdminPageContents />)} />
              <Route path="admin/site-settings" element={withSuspense(<AdminSiteSettings />)} />
              <Route path="admin/playground" element={withSuspense(<AdminPlayground />)} />
            </Route>

            {/* User routes */}
            <Route path="security" element={withSuspense(<Security />)} />
            <Route path="stats" element={withSuspense(<Stats />)} />
            <Route path="announcements" element={withSuspense(<Announcements />)} />
            <Route path="notifications" element={withSuspense(<Notifications />)} />
            <Route path="settings" element={withSuspense(<Settings />)} />

            {/* Agent routes */}
            <Route path="agent/dashboard" element={withSuspense(<AgentDashboard />)} />
            <Route path="agent/clients" element={withSuspense(<AgentClients />)} />
            <Route path="agent/commissions" element={withSuspense(<AgentCommissions />)} />
            <Route path="agent/withdraw" element={withSuspense(<AgentWithdraw />)} />
            <Route path="agent/redemption" element={withSuspense(<AgentRedemption />)} />
            <Route path="agent/finance" element={withSuspense(<AgentFinance />)} />
            <Route path="agent/reconciliation" element={withSuspense(<AgentReconciliation />)} />
            <Route path="invoices" element={withSuspense(<UserInvoices />)} />
            <Route path="refunds" element={withSuspense(<UserRefunds />)} />
            <Route path="agent/notifications" element={withSuspense(<Notifications />)} />
          </Route>

          {/* ── 供应商路由 ── */}
          <Route path="/vendor/login" element={withSuspense(<VendorLogin />)} />
          <Route path="/vendor/register" element={withSuspense(<VendorRegister />)} />
          <Route path="/vendor/register-success" element={withSuspense(<VendorRegisterSuccess />)} />
          <Route element={<VendorRoute />}>
            <Route element={<VendorLayout />}>
              <Route path="/vendor/dashboard" element={withSuspense(<VendorDashboard />)} />
            </Route>
          </Route>

          {/* ── 向后兼容重定向 ── */}
          <Route path="/admin/*" element={<Navigate to="/console/admin" replace />} />
          <Route path="/agent/*" element={<Navigate to="/console/agent" replace />} />
          <Route path="/api-keys" element={<Navigate to="/console/api-keys" replace />} />
          <Route path="/logs" element={<Navigate to="/console/logs" replace />} />
          <Route path="/recharge" element={<Navigate to="/console/recharge" replace />} />
          <Route path="/real-name" element={<Navigate to="/console/real-name" replace />} />
          <Route path="/redemption" element={<Navigate to="/console/redemption" replace />} />
          <Route path="/security" element={<Navigate to="/console/security" replace />} />
          <Route path="/stats" element={<Navigate to="/console/stats" replace />} />
          <Route path="/announcements" element={<Navigate to="/console/announcements" replace />} />
          <Route path="/notifications" element={<Navigate to="/console/notifications" replace />} />
          <Route path="/settings" element={<Navigate to="/console/settings" replace />} />
          <Route path="/operation-logs" element={<Navigate to="/console/operation-logs" replace />} />
          <Route path="/transactions" element={<Navigate to="/console/transactions" replace />} />
          <Route path="/invoices" element={<Navigate to="/console/invoices" replace />} />
          <Route path="/refunds" element={<Navigate to="/console/refunds" replace />} />
        </Routes>
        </ImpersonateProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
