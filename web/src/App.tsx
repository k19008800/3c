import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/hooks/use-auth'
import { ImpersonateProvider } from '@/hooks/use-impersonate'
import AppLayout from '@/components/layout/AppLayout'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import Dashboard from '@/pages/Dashboard'
import Models from '@/pages/Models'
import ApiKeys from '@/pages/ApiKeys'
import Logs from '@/pages/Logs'
import Recharge from '@/pages/Recharge'
import RealName from '@/pages/RealName'
import AdminDashboard from '@/pages/admin/Dashboard'
import AdminUsers from '@/pages/admin/Users'
import AdminModels from '@/pages/admin/AdminModels'
import AdminVendors from '@/pages/admin/Vendors'
import AdminVendorModels from '@/pages/admin/VendorModels'
import AdminAgents from '@/pages/admin/Agents'
import AdminLogs from '@/pages/admin/AdminLogs'
import AdminRechargeOrders from '@/pages/admin/RechargeOrders'
import AdminConfigs from '@/pages/admin/Configs'
import AdminRealNameReview from '@/pages/admin/RealNameReview'
import AdminAuditLogs from '@/pages/admin/AuditLogs'
import AdminAgentClients from '@/pages/admin/AgentClients'
import AdminFinanceDashboard from '@/pages/admin/FinanceDashboard'
import AdminFinanceCommissions from '@/pages/admin/FinanceCommissions'
import AdminFinanceReconciliation from '@/pages/admin/FinanceReconciliation'
import AdminWithdraws from '@/pages/admin/Withdraws'
import AdminSecurityConfig from '@/pages/admin/SecurityConfig'
import AdminSecurityEvents from '@/pages/admin/SecurityEvents'
import Security from '@/pages/Security'
import AgentDashboard from '@/pages/agent/Dashboard'
import AgentClients from '@/pages/agent/Clients'
import AgentCommissions from '@/pages/agent/Commissions'
import AgentWithdraw from '@/pages/agent/Withdraw'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ImpersonateProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="models" element={<Models />} />
            <Route path="api-keys" element={<ApiKeys />} />
            <Route path="logs" element={<Logs />} />
            <Route path="recharge" element={<Recharge />} />
            <Route path="real-name" element={<RealName />} />
            {/* Admin routes */}
            <Route path="admin" element={<AdminDashboard />} />
            <Route path="admin/users" element={<AdminUsers />} />
            <Route path="admin/models" element={<AdminModels />} />
            <Route path="admin/vendors" element={<AdminVendors />} />
            <Route path="admin/vendor-models" element={<AdminVendorModels />} />
            <Route path="admin/agents" element={<AdminAgents />} />
            <Route path="admin/logs" element={<AdminLogs />} />
            <Route path="admin/recharge-orders" element={<AdminRechargeOrders />} />
            <Route path="admin/real-name-review" element={<AdminRealNameReview />} />
            <Route path="admin/configs" element={<AdminConfigs />} />
            <Route path="admin/audit-logs" element={<AdminAuditLogs />} />
            <Route path="admin/agents/:agentId/clients" element={<AdminAgentClients />} />
            <Route path="admin/finance/dashboard" element={<AdminFinanceDashboard />} />
            <Route path="admin/finance/commissions" element={<AdminFinanceCommissions />} />
            <Route path="admin/finance/reconciliation" element={<AdminFinanceReconciliation />} />
            <Route path="admin/security" element={<AdminSecurityConfig />} />
          <Route path="admin/security/events" element={<AdminSecurityEvents />} />
            {/* User security */}
          <Route path="security" element={<Security />} />
            {/* Agent routes */}
            <Route path="agent/dashboard" element={<AgentDashboard />} />
            <Route path="agent/clients" element={<AgentClients />} />
            <Route path="agent/commissions" element={<AgentCommissions />} />
            <Route path="agent/withdraw" element={<AgentWithdraw />} />
          </Route>
        </Routes>
        </ImpersonateProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
