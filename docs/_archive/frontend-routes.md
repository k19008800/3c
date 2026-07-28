# 前端路由 & 组件树

> 路径：`3cloud/web/src/`
> 框架：React 19 + Vite + Tailwind CSS v4 + lucide-react + react-router-dom 6
> API 客户端：axios (`@/lib/api`)

## 路由结构

```
/login                   → Login            (登录页)
/register                → Register         (注册页)
/forgot-password         → ForgotPassword   (忘记密码)
/reset-password          → ResetPassword    (重置密码)
/                        → AppLayout        (主控制台布局)
├── (index)              → Dashboard        (控制台首页)
├── models               → Models           (模型列表)
├── api-keys             → ApiKeys          (API Key 管理)
├── logs                 → Logs             (调用日志)
├── recharge             → Recharge         (充值)
├── real-name            → RealName         (实名认证)
├── team                 → Team             (团队管理)
├── security             → Security         (账号安全)
├── notifications        → Notifications    (通知中心)
├── settings             → Settings         (个人设置)
├── docs                 → Docs             (API 文档)
├── admin                → AdminDashboard   (管理后台首页)
├── admin/users          → AdminUsers       (用户管理)
├── admin/models         → AdminModels      (模型管理)
├── admin/vendors        → AdminVendors     (厂商管理)
├── admin/vendor-models  → AdminVendorModels (厂商-模型映射)
├── admin/agents         → AdminAgents      (代理商管理)
├── admin/agents/:agentId/clients → AdminAgentClients (代理商客户)
├── admin/logs           → AdminLogs        (调用日志管理)
├── admin/recharge-orders → AdminRechargeOrders (充值订单)
├── admin/real-name-review → AdminRealNameReview (实名审核)
├── admin/configs        → AdminConfigs     (系统配置)
├── admin/email-templates → AdminEmailTemplates (邮件模板管理)
├── admin/audit-logs     → AdminAuditLogs   (审计日志)
├── admin/finance/dashboard → AdminFinanceDashboard (财务工作台)
├── admin/finance/commissions  → AdminFinanceCommissions (佣金流水)
├── admin/finance/reconciliation → AdminFinanceReconciliation (对账报表)
├── admin/security       → AdminSecurityConfig (安全策略配置)
├── admin/security/events → AdminSecurityEvents (安全事件)
├── agent/dashboard      → AgentDashboard   (代理商首页)
├── agent/clients        → AgentClients     (名下客户)
├── agent/commissions    → AgentCommissions  (分佣记录)
└── agent/withdraw       → AgentWithdraw    (提现)
```

## 组件树

### 通用页面（4 页）

```
pages/
├── Login.tsx                       — 登录页（含邮箱验证提示、安全验证码）
├── Register.tsx                    — 注册页（含密码强度验证）
├── ForgotPassword.tsx              — 忘记密码（输入邮箱 → 发送重置邮件）
└── ResetPassword.tsx               — 重置密码（验证 token + 新密码确认）
```

### 用户控制台（12 页）

```
pages/
├── Dashboard.tsx
│   └── (控制台首页概览 — 统计卡片、快捷操作、最近登录)
│
├── Models.tsx
│   └── (模型列表展示 — 名称/类型/供应商价格/状态)
│
├── ApiKeys.tsx
│   ├── ApiKeyList       — API Key 列表
│   └── CreateKeyModal   — 创建 Key 弹窗
│
├── Logs.tsx
│   └── (调用日志列表 — 支持分页、筛选)
│
├── Recharge.tsx
│   └── (充值页面 — 支持多种支付渠道)
│
├── RealName.tsx
│   └── (实名认证页面 — 个人/企业表单)
│
├── Team.tsx
│   └── (团队管理 — 创建团队、邀请成员、角色修改、移除成员)
│
├── Security.tsx
│   └── (账号安全 — 修改密码、会话管理、登录历史)
│
├── Notifications.tsx
│   └── (通知中心 — 站内信列表、未读标记、标记已读)
│
├── Settings.tsx
│   └── (个人设置 — 昵称修改、邮箱验证、OAuth 绑定)
│
├── Docs.tsx
│   ├── 左侧目录导航     — 模型列表/接入方式/定价收费/使用指南/代码示例
│   └── 右侧内容区       — 动态显示当前选中章节内容
│
└── (其他)
    └── ApiKeys.tsx, Logs.tsx 等已包含在以上列表中
```

### 管理后台（19 页）

```
pages/
├── admin/
│   ├── Dashboard.tsx
│   │   └── (管理后台首页 — 用户统计、今日充值、系统健康)
│   │
│   ├── Users.tsx
│   │   └── (用户管理 — 列表筛选、详情面板、操作/禁用/提权、模拟登录)
│   │
│   ├── AdminModels.tsx
│   │   └── (模型管理 — 模型 CRUD)
│   │
│   ├── Vendors.tsx
│   │   └── (厂商管理 — 厂商 CRUD)
│   │
│   ├── VendorModels.tsx
│   │   └── (厂商-模型定价映射)
│   │
│   ├── Agents.tsx
│   │   └── (代理商管理)
│   │
│   ├── AgentClients.tsx
│   │   └── (代理商客户列表)
│   │
│   ├── AdminLogs.tsx
│   │   └── (调用日志管理 — 全局日志查看)
│   │
│   ├── RechargeOrders.tsx
│   │   └── (充值订单管理 — 审核/确认)
│   │
│   ├── RealNameReview.tsx
│   │   └── (实名审核 — 列表/详情/通过/驳回)
│   │
│   ├── Configs.tsx
│   │   └── (系统配置 — 列表编辑/分组筛选)
│   │
│   ├── EmailTemplates.tsx
│   │   └── (邮件模板管理 — 中英文主题/HTML正文/预览)
│   │
│   ├── AuditLogs.tsx
│   │   └── (审计日志 — 操作记录查询)
│   │
│   ├── FinanceDashboard.tsx      — 财务工作台
│   ├── FinanceCommissions.tsx    — 佣金流水总览
│   ├── FinanceReconciliation.tsx — 对账报表
│   ├── SecurityConfig.tsx        — 安全策略配置
│   ├── SecurityEvents.tsx        — 安全事件列表
│   ├── SystemHealthPanel.tsx     — 系统健康面板
│   ├── TrendsCharts.tsx          — 趋势图表
│   └── Withdraws.tsx             — 提现审核
```

### 代理商控制台（4 页）

```
pages/
├── agent/
│   ├── Dashboard.tsx             — 代理商首页
│   ├── Clients.tsx               — 名下客户
│   ├── Commissions.tsx           — 分佣记录
│   └── Withdraw.tsx              — 提现
```

### 通用组件

```
components/
├── layout/
│   ├── AppLayout.tsx             — 主应用布局（侧边栏 + 内容区 + 模拟态横幅）
│   └── Sidebar.tsx               — 侧边栏导航（折叠/展开、角色权限过滤、通知下拉、退出模拟）
│
├── security/
│   ├── CircuitStatusBadge.tsx    — 熔断状态标签
│   └── RiskBadge.tsx             — 风险等级标签
│
├── ui/
│   ├── badge.tsx                 — 标签组件
│   ├── button.tsx                — 按钮组件
│   ├── card.tsx                  — 卡片组件
│   ├── input.tsx                 — 输入框组件
│   ├── CaptchaDialog.tsx         — 验证码弹窗
│   └── index.ts                  — UI 组件统一导出

hooks/
├── use-auth.tsx                  — 鉴权 hook（Token 管理 / 自动刷新 / 用户信息）
├── use-impersonate.tsx           — 模拟登录 hook（管理员以用户身份操作）
├── use-column-prefs.ts           — 表格列偏好管理
├── use-page-preferences.ts       — 页面偏好设置（筛选条件持久化）
└── use-search-history.ts         — 搜索历史

lib/
├── api.ts                        — axios 实例封装（拦截器 / 错误处理 / 刷新令牌 / 模拟态）
└── utils.ts                      — 通用工具函数（cn classname 合并等）

types/
└── index.ts                      — TypeScript 类型定义（所有 API 响应式接口）
```

## 路由配置表

```typescript
// src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
// ... imports ...

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ImpersonateProvider>
        <Routes>
          {/* 登录/注册（无布局） */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* 主布局 */}
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="models" element={<Models />} />
            <Route path="api-keys" element={<ApiKeys />} />
            <Route path="logs" element={<Logs />} />
            <Route path="recharge" element={<Recharge />} />
            <Route path="real-name" element={<RealName />} />
            <Route path="team" element={<Team />} />
            <Route path="security" element={<Security />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="settings" element={<Settings />} />
            <Route path="docs" element={<Docs />} />

            {/* 管理后台 */}
            <Route path="admin" element={<AdminDashboard />} />
            <Route path="admin/users" element={<AdminUsers />} />
            <Route path="admin/models" element={<AdminModels />} />
            <Route path="admin/vendors" element={<AdminVendors />} />
            <Route path="admin/vendor-models" element={<AdminVendorModels />} />
            <Route path="admin/agents" element={<AdminAgents />} />
            <Route path="admin/agents/:agentId/clients" element={<AdminAgentClients />} />
            <Route path="admin/logs" element={<AdminLogs />} />
            <Route path="admin/recharge-orders" element={<AdminRechargeOrders />} />
            <Route path="admin/real-name-review" element={<AdminRealNameReview />} />
            <Route path="admin/configs" element={<AdminConfigs />} />
            <Route path="admin/email-templates" element={<AdminEmailTemplates />} />
            <Route path="admin/audit-logs" element={<AdminAuditLogs />} />
            <Route path="admin/finance/dashboard" element={<AdminFinanceDashboard />} />
            <Route path="admin/finance/commissions" element={<AdminFinanceCommissions />} />
            <Route path="admin/finance/reconciliation" element={<AdminFinanceReconciliation />} />
            <Route path="admin/security" element={<AdminSecurityConfig />} />
            <Route path="admin/security/events" element={<AdminSecurityEvents />} />

            {/* 代理商控制台 */}
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
```

## 功能说明

### 邮箱验证
- `ForgotPassword.tsx`: 用户输入注册邮箱，触发送重置密码邮件
- `ResetPassword.tsx`: 从重置链接打开，验证 token 后设置新密码
- 后端维护 `emailVerifiedAt` 字段标识邮箱验证状态

### 会话管理
- `Security.tsx`: 查看活跃会话列表、强制登出其他设备
- 后端 token 通过 Redis 管理，支持手动失效

### 通知中心
- 站内信：实名审核结果、系统通知、登录提醒等
- 侧边栏通知下拉组件：实时显示未读数、最近 5 条通知
- `Notifications.tsx`: 完整通知列表，支持标记已读

### 邮件模板管理
- Admin 可编辑以下模板（存储在 `system_configs` 中以 `email_template_` 前缀命名）：
  - `register_verify` — 注册验证
  - `password_reset` — 密码重置
  - `recharge_confirm` — 充值确认
  - `real_name_result` — 实名结果通知
  - `login_alert` — 异地登录提醒
  - `account_banned` — 账号封禁通知
- 每个模板支持中英文主题 & HTML 正文，带预览功能
