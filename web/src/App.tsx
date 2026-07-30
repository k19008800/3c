import { Suspense, lazy } from 'react'
import type { JSX } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/hooks/use-auth'
import { ImpersonateProvider } from '@/hooks/use-impersonate'
import { ThemeProvider } from '@/contexts/ThemeContext'
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
const PortalStatus = lazy(() => import('@/pages/portal/Status'))

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
const ErrorCodeReference = lazy(() => import('@/pages/ErrorCodeReference'))
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
const AdminPromptAudit = lazy(() => import('@/pages/admin/PromptAudit'))
const AdminPromptTemplates = lazy(() => import('@/pages/admin/PromptTemplates'))
const AdminOperationAlerts = lazy(() => import('@/pages/admin/OperationAlerts'))

const AdminSensitiveWords = lazy(() => import('@/pages/admin/SensitiveWords'))
const AdminRechargeOrders = lazy(() => import('@/pages/admin/RechargeOrders'))
const AdminConfigs = lazy(() => import('@/pages/admin/Configs'))
const AdminRealNameReview = lazy(() => import('@/pages/admin/RealNameReview'))
const AdminAuditLogs = lazy(() => import('@/pages/admin/AuditLogs'))
const AdminOperationLogs = lazy(() => import('@/pages/admin/OperationLogs'))
const AdminAgentClients = lazy(() => import('@/pages/admin/AgentClients'))
const AdminUndoLogs = lazy(() => import('@/pages/admin/AdminUndoLogs'))
const AdminWebhookLogs = lazy(() => import('@/pages/admin/AdminWebhookLogs'))
const AdminStaffSchedule = lazy(() => import('@/pages/admin/AdminStaffSchedule'))
const AdminQualityChecks = lazy(() => import('@/pages/admin/AdminQualityChecks'))
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
const AdminRiskControl = lazy(() => import('@/pages/admin/risk-control'))
const AdminEmailTemplates = lazy(() => import('@/pages/admin/EmailTemplates'))
const AdminEnterpriseAnalysis = lazy(() => import('@/pages/admin/EnterpriseAnalysis'))
const AdminCircuitBreaker = lazy(() => import('@/pages/admin/CircuitBreakers'))
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
const AdminMonitoring = lazy(() => import('@/pages/admin/Monitoring'))
const AdminAlertRules = lazy(() => import('@/pages/admin/AlertRules'))
const AdminOperationTypes = lazy(() => import('@/pages/admin/OperationTypes'))
const AdminBehaviorAnalysis = lazy(() => import('@/pages/admin/BehaviorAnalysis'))
const AdminThreatIntel = lazy(() => import('@/pages/admin/ThreatIntel'))
const AdminEnvironments = lazy(() => import('@/pages/admin/Environments'))
const AdminHealthScore = lazy(() => import('@/pages/admin/HealthScore'))
const AdminABTesting = lazy(() => import('@/pages/admin/ABTesting'))
const AdminTwoFactorPolicy = lazy(() => import('@/pages/admin/TwoFactorPolicy'))
const AdminBudgetManagement = lazy(() => import('@/pages/admin/BudgetManagement'))
const AdminExchangeRates = lazy(() => import('@/pages/admin/AdminExchangeRates'))
const AdminDrills = lazy(() => import('@/pages/admin/AdminDrills'))
const AdminWebhooks = lazy(() => import('@/pages/admin/AdminWebhooks'))
const AdminSSO = lazy(() => import('@/pages/admin/AdminSSO'))
const CorpLogin = lazy(() => import('@/pages/admin/CorpLogin'))
const WechatLogin = lazy(() => import('@/pages/admin/WechatLogin'))
const CostAnalysis = lazy(() => import('@/pages/admin/CostAnalysis'))
const AdminCustomReports = lazy(() => import('@/pages/admin/CustomReports'))
const AdminReports = lazy(() => import('@/pages/admin/Reports'))

// ── 工单系统 ──
const UserTickets = lazy(() => import('@/pages/tickets/UserTickets'))
const CreateTicket = lazy(() => import('@/pages/tickets/CreateTicket'))
const TicketDetail = lazy(() => import('@/pages/tickets/TicketDetail'))
const AdminTickets = lazy(() => import('@/pages/admin/tickets/AdminTickets'))
const AdminTicketDetail = lazy(() => import('@/pages/admin/tickets/AdminTicketDetail'))
const StaffWorkbench = lazy(() => import('@/pages/admin/chat/StaffWorkbench'))
const StaffStats = lazy(() => import('@/pages/admin/chat/StaffStats'))
const StaffAuditLogs = lazy(() => import('@/pages/admin/chat/StaffAuditLogs'))
const AdminKnowledgeBase = lazy(() => import('@/pages/admin/knowledge/AdminKnowledgeBase'))
const KnowledgeBase = lazy(() => import('@/pages/knowledge/KnowledgeBase'))

// ── 请求记录 ──
const AdminRequestRecords = lazy(() => import('@/pages/admin/request-records/RequestRecordsList'))
const AdminRequestRecordDetail = lazy(() => import('@/pages/admin/request-records/RequestRecordDetail'))
const AdminRequestAnalysis = lazy(() => import('@/pages/admin/request-records/RequestAnalysisDashboard'))
const AdminTokenRankings = lazy(() => import('@/pages/admin/request-records/TokenRankings'))

// ── 用户端财务 ──
const UserInvoices = lazy(() => import('@/pages/finance/Invoices'))
const UserRefunds = lazy(() => import('@/pages/finance/Refunds'))

// ── 微信登录回调 ──
const LoginSuccess = lazy(() => import('@/pages/LoginSuccess'))

// ── Agent 页面 ──
const AgentDashboard = lazy(() => import('@/pages/agent/Dashboard'))
const AgentClients = lazy(() => import('@/pages/agent/Clients'))
const AgentCommissions = lazy(() => import('@/pages/agent/Commissions'))
const AgentWithdraw = lazy(() => import('@/pages/agent/Withdraw'))
const AgentRedemption = lazy(() => import('@/pages/agent/Redemption'))
const AgentFinance = lazy(() => import('@/pages/agent/Finance'))
const AgentReconciliation = lazy(() => import('@/pages/agent/Reconciliation'))
const AgentProfile = lazy(() => import('@/pages/agent/Profile'))
const AgentReferral = lazy(() => import('@/pages/agent/Referral'))

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
        <ThemeProvider>
          <ImpersonateProvider>
            <Routes>
          {/* ── 公开门户页面 (无需登录) ── */}
          <Route element={withSuspense(<PublicLayout />)}>
            <Route index element={withSuspense(<PortalHome />)} />
            <Route path="pricing" element={withSuspense(<PortalPricing />)} />
            <Route path="docs" element={withSuspense(<PortalDocs />)} />
            <Route path="models" element={withSuspense(<PortalModels />)} />
            <Route path="status" element={withSuspense(<PortalStatus />)} />
          </Route>

          {/* ── 认证页面 (无布局) ── */}
          <Route path="/login" element={withSuspense(<Login />)} />
          <Route path="/login-success" element={withSuspense(<LoginSuccess />)} />
          <Route path="/register" element={withSuspense(<Register />)} />
          <Route path="/forgot-password" element={withSuspense(<ForgotPassword />)} />
          <Route path="/reset-password" element={withSuspense(<ResetPassword />)} />

          {/* ── 公开错误码参考文档 (无需登录) ── */}
          <Route path="/error-codes" element={withSuspense(<ErrorCodeReference />)} />
          <Route path="/error-codes/:code" element={withSuspense(<ErrorCodeReference />)} />

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
              <Route path="admin/system/undo-logs" element={withSuspense(<AdminUndoLogs />)} />
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
              <Route path="admin/risk-control" element={withSuspense(<AdminRiskControl />)} />
              <Route path="admin/enterprise-analysis" element={withSuspense(<AdminEnterpriseAnalysis />)} />
              <Route path="admin/circuit-breaker" element={withSuspense(<AdminCircuitBreaker />)} />
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
              <Route path="admin/prompt-audit" element={withSuspense(<AdminPromptAudit />)} />
              <Route path="admin/prompt-templates" element={withSuspense(<AdminPromptTemplates />)} />
              <Route path="admin/operation-alerts" element={withSuspense(<AdminOperationAlerts />)} />
              <Route path="admin/sensitive-words" element={withSuspense(<AdminSensitiveWords />)} />
              <Route path="admin/monitoring" element={withSuspense(<AdminMonitoring />)} />
              <Route path="admin/alert-rules" element={withSuspense(<AdminAlertRules />)} />
              <Route path="admin/operation-types" element={withSuspense(<AdminOperationTypes />)} />
              <Route path="admin/behavior-analysis" element={withSuspense(<AdminBehaviorAnalysis />)} />
              <Route path="admin/threat-intel" element={withSuspense(<AdminThreatIntel />)} />
              <Route path="admin/environments" element={withSuspense(<AdminEnvironments />)} />
              <Route path="admin/health-score" element={withSuspense(<AdminHealthScore />)} />
              <Route path="admin/ab-testing" element={withSuspense(<AdminABTesting />)} />
              <Route path="admin/security/2fa-policy" element={withSuspense(<AdminTwoFactorPolicy />)} />
              <Route path="admin/budget" element={withSuspense(<AdminBudgetManagement />)} />
              <Route path="admin/finance/rates" element={withSuspense(<AdminExchangeRates />)} />
              <Route path="admin/drills" element={withSuspense(<AdminDrills />)} />
              <Route path="admin/webhooks" element={withSuspense(<AdminWebhooks />)} />
              <Route path="admin/webhook-logs" element={withSuspense(<AdminWebhookLogs />)} />
              <Route path="admin/settings/sso" element={withSuspense(<AdminSSO />)} />
              <Route path="admin/settings/corp-login" element={withSuspense(<CorpLogin />)} />
              <Route path="admin/settings/wechat-login" element={withSuspense(<WechatLogin />)} />
              <Route path="admin/finance/cost-analysis" element={withSuspense(<CostAnalysis />)} />
              <Route path="admin/custom-reports" element={withSuspense(<AdminCustomReports />)} />
              <Route path="admin/reports" element={withSuspense(<AdminReports />)} />
              <Route path="admin/request-records" element={withSuspense(<AdminRequestRecords />)} />
              <Route path="admin/request-records/analysis" element={withSuspense(<AdminRequestAnalysis />)} />
              <Route path="admin/request-records/token-rankings" element={withSuspense(<AdminTokenRankings />)} />
              <Route path="admin/request-records/:id" element={withSuspense(<AdminRequestRecordDetail />)} />
              
              {/* 工单系统 */}
              <Route path="admin/tickets" element={withSuspense(<AdminTickets />)} />
              <Route path="admin/tickets/:id" element={withSuspense(<AdminTicketDetail />)} />

              {/* 在线客服 */}
              <Route path="admin/chat" element={withSuspense(<StaffWorkbench />)} />
              <Route path="admin/chat/stats" element={withSuspense(<StaffStats />)} />
              <Route path="admin/chat/audit" element={withSuspense(<StaffAuditLogs />)} />

              {/* 知识库管理 */}
              <Route path="admin/knowledge" element={withSuspense(<AdminKnowledgeBase />)} />

              {/* 排班、SLA、质检 */}
              <Route path="admin/support/schedule" element={withSuspense(<AdminStaffSchedule />)} />
              <Route path="admin/support/quality" element={withSuspense(<AdminQualityChecks />)} />
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
            
            {/* 用户端工单 */}
            <Route path="tickets" element={withSuspense(<UserTickets />)} />
            <Route path="tickets/new" element={withSuspense(<CreateTicket />)} />
            <Route path="tickets/:id" element={withSuspense(<TicketDetail />)} />

            {/* 知识库 */}
            <Route path="knowledge" element={withSuspense(<KnowledgeBase />)} />
            <Route path="invoices" element={withSuspense(<UserInvoices />)} />
            <Route path="refunds" element={withSuspense(<UserRefunds />)} />
            <Route path="agent/notifications" element={withSuspense(<Notifications />)} />
            <Route path="agent/referral" element={withSuspense(<AgentReferral />)} />
            <Route path="agent/profile" element={withSuspense(<AgentProfile />)} />
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
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
