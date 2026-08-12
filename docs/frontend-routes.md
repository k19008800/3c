# 3cloud 前端页面路由与结构文档

> **最后更新**：2026-08-12
> **版本**：v3.0
> **定位**：前端所有页面路由、布局结构、组件树的可视化参考，面向开发者和产品经理。
> **架构**：**单一前端**（web-console，Vite, `web-console/`）+ **官网/入口**（web-portal, Next.js, `web-portal/`），对外唯一入口端口 5177

---

## 一、路由总览

> **路由入口规则**：`/` 是官网首页（web-portal），`/app/` 是唯一业务控制台入口（web-console，基路径 `/app/`）。
> 公开页面（首页/模型/定价等）无需登录；控制台/管理后台需要登录。
> 收敛前的旧 URL（`/login`、`/dashboard`、`/apikey` 等）由 web-portal 的 Next `redirects()` 308 → `/app/*` 对应页，见 §5.2。

```
/                     ← 官网首页（web-portal，公开）
├── /models           → 模型目录（公开）
├── /pricing          → 定价方案（公开）
├── /about            → 关于我们（公开）
│
└── /app/*            ← 唯一业务控制台（web-console，Vite，基路径 /app/）
    ├── /login        → 登录
    ├── /register     → 注册
    ├── /forgot-password → 忘记密码
    ├── /oauth        → 第三方绑定
    │
    ├── /statistics   → 使用统计
    ├── /dashboard    → 用户仪表盘（按角色跳转）
    ├── /api-keys     → API Key 管理
    ├── /logs         → 调用日志
    ├── /recharge     → 充值
    ├── /billing      → 账单
    ├── /invoices     → 发票管理
    ├── /redemption   → 兑换码
    ├── /security     → 安全设置
    ├── /tickets      → 工单
    ├── /chat         → 在线客服
    ├── /playground   → API Playground
    ├── /real-name    → 实名认证
    ├── /announcements→ 公告列表
    ├── /notification → 通知列表
    ├── /settings/notifications → 通知偏好设置
    ├── /help         → 帮助中心
    ├── /webhooks     → Webhook 配置
    ├── /data-export  → 数据导出授权
    ├── /account-deletion → 账号注销
    ├── /user-groups  → 用户分组
    ├── /vendor-selector → 供应商选择器
    ├── /topup-records→ 充值记录
    │
    ├── /admin/*      ← 管理后台（角色 L4+）
    │   ├── /dashboard → 运营总览看板
    │   ├── /cockpit   → 运营驾驶舱
    │   ├── /customers → 客户管理
    │   │   └── /:userId → 客户详情
    │   ├── /finance   → 财务管理
    │   │   ├── /dashboard → 财务看板
    │   │   ├── /orders → 充值订单
    │   │   ├── /refunds → 退款审核
    │   │   ├── /invoices → 发票管理
    │   │   ├── /commissions → 佣金流水
    │   │   ├── /pricing → 价格配置
    │   │   ├── /settlement → 结算管理
    │   │   ├── /reconciliation → 自动对账
    │   │   ├── /cost-dashboard → 成本看板
    │   │   ├── /cost-prediction → 成本预测
    │   │   └── /profit → 利润分析
    │   ├── /suppliers → 供应商管理
    │   │   ├── /:id   → 供应商详情
    │   │   ├── /vendor-profiles → 供应商档案
    │   │   ├── /vendor-pricing → 供应商定价
    │   │   └── /price-change → 价格变更
    │   ├── /agents    → 代理商管理
    │   │   └── /withdrawals → 提现审核
    │   ├── /models    → 模型管理
    │   ├── /marketing → 营销推广
    │   ├── /tickets   → 工单管理
    │   ├── /settings  → 系统设置
    │   │   ├── /announcements → 公告管理
    │   │   ├── /roles → 角色权限
    │   │   └── /i18n  → 多语言
    │   ├── /config    → 运维配置
    │   │   ├── /system → 系统配置
    │   │   ├── /logs  → 系统日志
    │   │   ├── /content → 内容管理
    │   │   └── /email-templates → 邮件模板
    │   ├── /audit     → 审计合规
    │   │   └── /conversation-records → 对话上下文留痕
    │   └── /risk      → 风控管理
    │       ├── /dashboard → 风控总览
    │       ├── /rules → 风控规则
    │       └── /events → 风控事件
    │
    ├── /agent/*      ← 代理商端（角色=agent）
    │   ├── /dashboard → 代理仪表盘
    │   ├── /customers → 客户管理
    │   ├── /commission → 佣金明细
    │   ├── /consumption → 消费统计
    │   ├── /settlements → 结算管理
    │   ├── /invite    → 邀请裂变
    │   ├── /ranking   → 业绩排行榜
    │   ├── /withdraw  → 提现申请
    │   └── /settings  → 代理设置
    │
    ├── /vendor/*     ← 供应商端（独立布局）
    │   ├── /login    → 供应商登录
    │   ├── /register → 供应商注册
    │   ├── /dashboard → 供应商仪表盘
    │   ├── /models   → 模型管理
    │   ├── /stats    → 数据统计
    │   └── /settlements → 结算对账
    │
    └── /sales/*      ← 业务员端
        ├── /customers → 客户管理
        ├── /reminders → 跟进提醒
        └── /performance → 业绩看板
```

---

## 二、布局结构

### 2.1 Portal 官网布局（公开页面）

> 框架：Next.js App Router，文件：`web-portal/src/app/layout.tsx`

```
RootLayout (app/layout.tsx)
├── PortalHeader
│   ├── Logo
│   ├── Navigation（首页/模型/定价/关于）
│   └── CTA（登录/注册按钮）
│
├── {children}  ← 页面内容
│
└── PortalFooter
    ├── 产品链接
    ├── 法律信息
    └── 实时数据（已接入模型/服务用户/处理 Token）
```

### 2.2 ~~Portal 控制台布局（已登录）~~ — 已下线

> 收敛后 web-portal 不再承载任何控制台页面。原 `web-portal/src/app/(portal)/`（17 页 mock 壳）与 `(auth)/`（4 页认证）已于 2026-08-10 删除，对应 URL 由 Next `redirects()` 308 → `/app/*`（见 §5.2）。登录/注册/控制台全部由 web-console 提供。

### 2.3 Console 控制台布局（web-console，管理后台/代理端等）

> 框架：Vite + React Router，文件：`web-console/src/layouts/ConsoleLayout.tsx`

```
ConsoleLayout (Vite)
├── Sidebar（左侧导航）
│   ├── 按角色显示不同菜单
│   │   ├── 用户: Dashboard, API Keys, Logs, Billing, Playground
│   │   ├── 代理: Agent Dashboard, Customers, Commission, Withdraw
│   │   ├── 管理员: Admin Dashboard, Users, Finance, Suppliers, Config
│   │   └── 业务员: Sales Customers, Reminders, Performance
│   └── 角色切换（管理员可见）
│
├── 顶部栏
│   ├── 通知
│   └── 用户菜单
│
└── 主内容区
    └── {children} ← 由 React Router <Outlet /> 渲染
    │
    ├── 主内容区
    │   ├── AlertNotification（告警横幅）
    │   └── {children}
    │
    └── RealTimeNotification
```

**相关文件：** `components/layout/AdminRoute.tsx`, `components/admin/AlertNotification.tsx`

### 2.4 Agent 布局（代理商端）

```
AgentRoute (权限守卫)
└── AppLayout
    ├── Sidebar（代理侧导航）
    │   ├── 仪表盘
    │   ├── 客户管理
    │   ├── 佣金明细
    │   ├── 财务概览
    │   ├── 提现申请
    │   ├── 结算对账
    │   ├── 兑换码
    │   ├── 通知
    │   └── 代理信息
    │
    └── 主内容区
        └── {children}
```

### 2.5 Vendor 布局（供应商端）

```
VendorRoute (权限守卫)
└── VendorLayout
    ├── VendorSidebar（供应商侧导航）
    │   ├── 总览
    │   ├── 模型管理
    │   ├── API Key 管理
    │   └── 个人信息
    │
    └── 主内容区
        └── {children}
```

---

## 三、核心页面组件树

### 3.1 用户仪表盘（Dashboard.tsx）

```
Dashboard
├── OnboardingGuide（新用户引导，首次登录时显示）
├── 16 个区域组件
│   ├── BillingCycleCard（结算周期预览）
│   ├── CostForecastCard（成本预测）
│   ├── AlertCenter（告警中心）
│   ├── LiveActivityFeed（实时活动流）
│   ├── ModelOptimizationTip（模型优化建议）
│   └── ...（其他 11 个组件）
└── OverviewTrends（概览趋势图）
```

**文件：** `pages/Dashboard.tsx`, `pages/dashboard/components/`

### 3.2 API Key 管理（ApiKeys.tsx）

```
ApiKeys
├── Key 创建表单
├── Key 列表（表格）
│   ├── 名称/前缀/状态/使用量/最后使用
│   └── 操作列（编辑/禁禁/删除）
├── API Key 权限编辑弹窗（ApiKeyPermissionsDialog）
└── 批量操作栏
```

**文件：** `pages/ApiKeys.tsx`, `components/ApiKeyPermissionsDialog.tsx`

### 3.3 调用日志（Logs.tsx + Logs-virtual.tsx）

```
Logs
├── LogsFilter（筛选器：时间/模型/状态/Key）
├── LogStatsCards（统计卡片）
├── LogTrendChart（趋势图）
├── LogModelChart（模型分布图）
├── VirtualLogsTable（虚拟滚动表格）
├── LogDetailDrawer（详情抽屉）
├── LogAnomaliesPanel（异常分析）
├── LogExportButton（导出）
└── KeyComparison（Key 对比）
```

**文件：** `pages/Logs.tsx`, `pages/Logs-virtual.tsx`, `components/logs/`

### 3.4 管理后台仪表盘（Dashboard.tsx / admin）

```
AdminDashboard
├── SummaryBar（顶部摘要：收入/用户/调用量）
├── StatsCards（关键指标卡片）
├── KpiCards（12 项运营 KPI）
├── OperationalKpiPanel（运营 KPI 面板）
├── TodoQueue（运营待办队列）
├── QuickActions（快捷操作）
├── AlertBar（告警横幅）
├── RecentActivity（最近活动流）
├── RevenueChart（收入趋势图）
├── RevenueBreakdown（收入构成）
├── TopModels（热门模型排行）
├── ModelRankBar（模型排名）
├── TopUsersTable（活跃用户排行）
├── VendorHealthPanel（供应商健康状态）
├── UsageChart（用量趋势图）
├── OverviewTrends（概览趋势）
├── ModelSchedulingRealtime（实时调度）
└── TimeRangeSelector（时间范围选择器）
```

**文件：** `pages/admin/Dashboard.tsx`, `pages/admin/dashboard/`

### 3.5 管理后台用户管理（UsersPage.tsx）

```
UsersPage
├── UserList（用户表格）
│   ├── UserFilters（筛选器）
│   ├── BatchActionBar（批量操作栏）
│   └── VirtualUsersList（虚拟滚动列表）
│
├── UserDetailPanel（详情侧栏）
│   ├── UserDetailTabs（标签页切换）
│   │   ├── UserInfoTab（信息页）
│   │   │   ├── 基本信息
│   │   │   ├── 实名信息
│   │   │   ├── 余额信息
│   │   │   ├── 登录安全
│   │   │   └── 配额信息
│   │   ├── UserKeyPanel（Key 管理）
│   │   ├── UserLogPanel（日志）
│   │   ├── UserBalancePanel（余额流水）
│   │   ├── UserCallStatsTab（调用统计）
│   │   └── UserActivityTab（活动记录）
│   └── ActionButtons（操作按钮组）
│
├── CreateUserModal（创建用户弹窗）
└── UserStatsCard（统计卡片）
```

**文件：** `pages/admin/users/`

### 3.6 代理端仪表盘（Dashboard.tsx / agent）

```
AgentDashboard
├── KpiCards（6 个核心指标：总客户/月新增/月消费/月佣金/待结算/佣金率）
├── QuickActions（快速操作）
├── RecentOrders（最近订单）
└── TrendChart（趋势图）
```

**文件：** `pages/agent/Dashboard.tsx`, `pages/agent/agent-dashboard/`

---

## 四、公共组件库

### 4.1 UI 基础组件（`components/ui/`）

| 组件 | 说明 | 用途 |
|------|------|------|
| `button.tsx` | 按钮组件 | 全部页面 |
| `card.tsx` | 卡片容器 | 仪表盘、列表 |
| `input.tsx` | 输入框 | 表单 |
| `badge.tsx` | 标签/徽章 | 状态展示 |
| `skeleton.tsx` | 骨架屏 | 加载态 |
| `Modal.tsx` | 弹窗 | 详情/编辑 |
| `SlideDrawer.tsx` | 侧栏抽屉 | 详情面板 |
| `ConfirmDialog.tsx` | 确认对话框 | 重要操作确认 |
| `CaptchaDialog.tsx` | 验证码弹窗 | 安全验证 |
| `PaginationBar.tsx` | 分页栏 | 列表分页 |
| `FilterBar.tsx` | 筛选栏 | 列表筛选 |
| `FilterPresets.tsx` | 筛选预设 | 保存/加载筛选条件 |
| `BatchActionBar.tsx` | 批量操作栏 | 多选操作 |
| `ExportMenu.tsx` | 导出菜单 | CSV/JSON 导出 |
| `InlineEdit.tsx` | 行内编辑 | 快速编辑字段 |
| `InlineToggle.tsx` | 行内开关 | 快速切换状态 |
| `FormField.tsx` | 表单字段 | 统一表单布局 |
| `EmptyState.tsx` | 空状态 | 无数据展示 |
| `MiniChart.tsx` | 迷你图表 | 趋势展示 |
| `QuotaProgress.tsx` | 配额进度条 | 用量展示 |
| `VirtualList.tsx` | 虚拟滚动列表 | 大数据列表 |
| `VirtualTable.tsx` | 虚拟滚动表格 | 大数据表格 |
| `VirtualScrollDemo.tsx` | 虚拟滚动演示 | 测试/演示 |

### 4.2 业务组件

| 组件 | 位置 | 说明 |
|------|------|------|
| `RealTimeNotification.tsx` | `components/` | WebSocket 实时通知 |
| `ErrorBoundary.tsx` | `components/` | 错误边界 |
| `ThemeSwitcher.tsx` | `components/` | 主题切换 |
| `RichTextEditor.tsx` | `components/` | 富文本编辑器 |
| `RichTextViewer.tsx` | `components/` | 富文本查看器 |
| `ExportButton.tsx` | `components/` | 导出按钮 |
| `VirtualList.tsx` | `components/` | 虚拟滚动 |

---

## 五、路由架构

### 5.1 单一入口架构

3cloud 前端 = **一个业务应用（web-console）+ 一个官网/入口（web-portal）**，对外只暴露端口 5177：

| 应用 | 框架 | 端口 | 角色 | 路由范围 |
|------|------|------|------|---------|
| **web-portal** | Next.js 15 (App Router) | 5177 | 官网 + 代理/重定向层 | `/` 官网公开页；`/app/*`、`/api/*`、`/v1/*` rewrites 代理；旧 URL redirects |
| **web-console** | Vite 6 + React Router 7 | 5175 (仅本机 dev) | **唯一业务应用** | `/app/` 基路径下全部页面（认证、用户端、管理后台、代理、供应商、业务员） |

`5175` 只绑定 loopback（`host: "127.0.0.1"`），仅作为 web-portal 内部代理的 dev 服务，不对用户直连。

### 5.2 web-portal 路由 (Next.js App Router)

```
src/app/
├── page.tsx                    → / 官网首页
├── layout.tsx                  → 全局布局（header「登录」→ /app/login）
├── models/page.tsx             → /models 模型目录
├── pricing/page.tsx            → /pricing 定价方案
├── about/page.tsx              → /about 关于我们
├── status/page.tsx             → /status 系统状态
│
└── next.config.mjs             → rewrites（/app/*→5175、/api、/v1、/health）+ redirects
```

**redirects（308 永久重定向，旧入口 URL → `/app/*`）：**

| 旧 URL | → | 旧 URL | → |
|---|---|---|---|
| /login | /app/login | /ticket | /app/tickets |
| /register | /app/register | /chat | /app/chat |
| /forgot-password | /app/forgot-password | /notifications | /app/notification |
| /2fa | /app/security | /notification-settings | /app/settings/notifications |
| /dashboard | /app/ | /announcements | /app/announcements |
| /apikey | /app/api-keys | /help | /app/help |
| /recharge | /app/recharge | /webhooks | /app/webhooks |
| /invoice | /app/invoices | /realname | /app/real-name |
| /statistics | /app/statistics | /consent | /app/data-export |
| /security | /app/security | /deletion | /app/account-deletion |
| /redemption | /app/redemption | /logs、/billing、/playground、/user-groups、/vendor-selector、/recharge-records、/vendor(/*) | /app/ 对应页 |

### 5.3 web-console 路由 (Vite + React Router)

> 基路径：`/app/`（vite.config.ts 中 `base: "/app/"`）

```typescript
// web-console/src/App.tsx 路由结构

<Routes>
  {/* 供应商独立路由 */}
  <Route path="/vendor/login" element={<VendorLoginPage />} />
  <Route path="/vendor/register" element={<VendorRegisterPage />} />
  <Route path="/vendor" element={<VendorLayout />}>
    <Route index element={<VendorDashboardPage />} />
    <Route path="models" element={<VendorModelsPage />} />
    <Route path="stats" element={<VendorStatsPage />} />
    <Route path="settlements" element={<VendorSettlementsPage />} />
  </Route>

  {/* 登录 / 注册 / 忘记密码 / 第三方绑定（公开） */}
  <Route path="/login" element={<LoginPage />} />
  <Route path="/register" element={<RegisterPage />} />
  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
  <Route path="/oauth" element={<OAuthPage />} />

  {/* 控制台主路由（Protected） */}
  <Route path="/" element={<Protected><ConsoleLayout /></Protected>}>
    <Route index element={<DashboardRedirect />} />
    {/* 用户端路由 */}
    <Route path="statistics" element={<StatisticsPage />} />
    <Route path="api-keys" element={<ApiKeysPage />} />
    <Route path="logs" element={<LogsPage />} />
    <Route path="recharge" element={<RechargePage />} />
    <Route path="billing" element={<BillingPage />} />
    {/* ... 更多用户端路由 */}
    {/* 管理后台路由 /admin/* */}
    {/* 代理端路由 /agent/* */}
    {/* 业务员端路由 /sales/* */}
    {/* 供应商端路由 /vendor/* */}
  </Route>
</Routes>
```

### 5.4 生产环境 Nginx 路由规则

```nginx
# 统一入口（生产域名）→ 内部路由分发
location /app/ {
    # web-console 静态产物（Vite build，base=/app/）
    alias /www/wwwroot/3c/web-console/;
    try_files $uri $uri/ /app/index.html;
}

location / {
    # 官网 + API/旧 URL 重定向 → web-portal (Next.js, 端口 3100)
    proxy_pass http://127.0.0.1:3100;
}
# /api/、/v1/、/health → 后端 3000
```

旧入口 URL（/login、/dashboard、/apikey 等）到达 web-portal 后由 Next `redirects()` 308 → `/app/*`，再被上面的 `location /app/` 命中。若生产需要字面 301，可在 nginx 加 `rewrite ^/login$ /app/login permanent;` 等规则。

---

## 六、页面统计

| 端 | 页面数 | 框架 | 源码目录 |
|------|:---:|------|---------|
| 官网 | 5 | Next.js | `web-portal/src/app/` (公开页) |
| ~~Portal 控制台~~ | ~~17~~ | ~~Next.js~~ | ~~已删除~~（redirects 到 /app/*） |
| ~~认证~~ | ~~4~~ | ~~Next.js~~ | ~~已删除~~（由 console 承接） |
| 用户端 | 13 | Vite | `web-console/src/pages/` |
| 管理后台 | 72 | Vite | `web-console/src/pages/admin/` + `web-console/src/pages/` |
| 代理端 | 8 | Vite | `web-console/src/pages/Agent*.tsx` |
| 供应商端 | 6 | Vite | `web-console/src/pages/vendor/` |
| 业务员端 | 3 | Vite | `web-console/src/pages/Sales*.tsx` |
| **合计** | **~106** | — | 单业务应用 web-console |

---

## 七、交叉引用

| 其他文档 | 关联内容 |
|---------|---------|
| PRD-README.md §2.2 | 用户仪表盘组件规格 |
| PRD-README.md §4.1 | 管理看板组件规格 |
| PRD-README.md §6 | Portal 门户页面规格 |
| ref-2.2-user-dashboard.md | 用户仪表盘 16 个区域深化 |
| ref-4.1-admin-dashboard.md | 管理看板深化 |
| ref-4.2-user-management.md | 用户管理页面深化 |
| ref-5.3-rate-limiter.md | 限流管理页面（RateLimits.tsx） |
| ref-5.4-alert-rules.md | 告警规则配置页面 |