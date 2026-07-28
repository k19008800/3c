# 3cloud 前端页面路由与结构文档

> **最后更新**：2026-07-28
> **版本**：v1.0
> **定位**：前端所有页面路由、布局结构、组件树的可视化参考，面向开发者和产品经理。
> 前端框架：React + Vite + TypeScript，路径 `web/src/`

---

## 一、路由总览

```
/
├── /portal/*           ← 公开门户（无需登录）
│   ├── /               → 首页 Hero + 特性
│   ├── /models         → 模型目录
│   ├── /pricing        → 定价方案
│   ├── /docs           → 开发者文档
│   └── /status         → 系统状态
│
├── /auth/*             ← 认证（未登录访问）
│   ├── /login          → 登录
│   ├── /register       → 注册
│   ├── /forgot-password → 忘记密码
│   └── /reset-password → 重置密码
│
├── /app/*              ← 用户端（已登录）
│   ├── /dashboard      → 用户仪表盘
│   ├── /api-keys       → API Key 管理
│   ├── /models         → 可用模型列表
│   ├── /logs           → 调用日志
│   ├── /stats          → 使用统计
│   ├── /recharge       → 充值
│   ├── /redemption     → 兑换码
│   ├── /invoices       → 发票管理
│   ├── /refunds        → 退款申请
│   ├── /transactions   → 交易记录
│   ├── /notifications  → 通知列表
│   ├── /announcements  → 公告列表
│   ├── /settings       → 设置
│   │   ├── /profile    → 个人信息
│   │   ├── /security   → 安全设置
│   │   ├── /2fa        → 双因素认证
│   │   ├── /sessions   → 设备管理
│   │   ├── /login-history → 登录历史
│   │   ├── /theme      → 主题设置
│   │   └── /preferences → 偏好设置
│   ├── /real-name      → 实名认证
│   ├── /error-codes    → 错误码参考
│   └── /docs           → 用户端文档
│
├── /admin/*            ← 管理后台（角色等级 L4+）
│   ├── /dashboard      → 运营总览看板
│   ├── /users          → 用户管理
│   ├── /real-name      → 实名审核
│   ├── /vendors        → 供应商管理
│   ├── /vendor-models  → 模型映射管理
│   ├── /vendor-key-groups → Key 资源池
│   ├── /models         → 模型管理
│   ├── /api-keys       → 管理端 Key 管理
│   ├── /recharge-orders → 充值订单审核
│   ├── /withdraws      → 提现审核
│   ├── /agents         → 代理管理
│   ├── /agent-detail   → 代理详情
│   ├── /finance        → 财务管理
│   │   ├── /dashboard  → 财务看板
│   │   ├── /prices     → 价格配置
│   │   ├── /invoices   → 发票管理
│   │   ├── /refunds    → 退款管理
│   │   ├── /cost       → 成本核算
│   │   ├── /agent-cost → 代理成本
│   │   └── /settlement → 代理结算
│   ├── /finance-commissions → 佣金管理
│   ├── /finance-reconciliation → 自动对账
│   ├── /campaigns      → 活动管理
│   ├── /redemption     → 兑换码管理
│   ├── /announcements  → 公告管理
│   ├── /email-templates → 邮件模板
│   ├── /page-contents  → 页面内容管理
│   ├── /prompt-templates → 提示词模板
│   ├── /configs        → 系统配置
│   ├── /config-versions → 配置版本管理
│   ├── /quotas         → 用户配额管理
│   ├── /rate-limits    → 模型限流规则
│   ├── /alert-rules    → 告警规则配置
│   ├── /operation-alerts → 实时告警
│   ├── /operation-logs → 操作日志
│   ├── /operation-types → 操作类型管理
│   ├── /monitoring     → 系统监控
│   ├── /security       → 安全风控
│   │   ├── /dashboard  → 安全总览
│   │   ├── /events     → 安全事件
│   │   ├── /config     → 安全配置
│   │   ├── /bans       → IP/用户封禁
│   │   ├── /rules      → 自动规则
│   │   └── /threat-intel → 威胁情报
│   ├── /audit-logs     → 审计日志
│   ├── /prompt-audit   → 提示词审计
│   ├── /sensitive-words → 敏感词管理
│   ├── /roles          → 角色权限管理
│   ├── /stats          → 统计报表
│   ├── /trends         → 趋势分析
│   ├── /enterprise     → 企业分析
│   ├── /enterprise-analysis → 企业深度分析
│   ├── /custom-reports → 自定义报表
│   ├── /ab-testing     → A/B 测试
│   ├── /circuit-breakers → 熔断器管理
│   ├── /health-score   → 健康评分
│   ├── /environments   → 多环境管理
│   ├── /behavior-analysis → 行为分析
│   ├── /system-health  → 系统健康状态
│   ├── /vendor-self    → 供应商自助管理
│   ├── /playground     → API Playground
│   ├── /profit-analysis → 利润分析
│   ├── /risk-control   → 风控管理
│   └── /site-settings  → 站点设置
│
├── /agent/*            ← 代理商端（角色=agent）
│   ├── /dashboard      → 代理仪表盘
│   ├── /clients        → 客户管理
│   ├── /commissions    → 佣金明细
│   ├── /finance        → 财务概览
│   ├── /withdraw       → 提现申请
│   ├── /reconciliation → 结算对账
│   ├── /redemption     → 兑换码管理
│   ├── /notifications  → 通知
│   ├── /profile        → 代理信息
│   └── /team           → 团队管理
│
├── /vendor/*           ← 供应商端
│   ├── /login          → 供应商登录
│   ├── /register       → 供应商注册
│   └── /dashboard      → 供应商仪表盘
│
└── /console/*          ← 控制台
    └── /announcements  → 公告（已读统计）
```

---

## 二、布局结构

### 2.1 Portal 布局（公开门户）

```
PublicLayout
├── PortalHeader
│   ├── Logo
│   ├── Navigation（首页/模型/定价/文档/状态）
│   └── CTA（登录/注册按钮）
│
├── {children}  ← 页面内容
│
└── PortalFooter
    ├── 产品链接
    ├── 法律信息
    └── 实时数据（已接入模型/服务用户/处理 Token）
```

**相关文件：** `components/portal/PublicLayout.tsx`, `PortalHeader.tsx`, `PortalFooter.tsx`

### 2.2 App 布局（用户端）

```
AppLayout
├── Sidebar（左侧导航）
│   ├── 用户信息摘要
│   ├── 导航菜单分组
│   │   ├── 概览: Dashboard
│   │   ├── 开发: API Keys, Models, Docs, Error Codes
│   │   ├── 监控: Logs, Stats, Notifications
│   │   ├── 财务: Recharge, Invoices, Refunds, Transactions
│   │   ├── 账户: Real Name, Settings
│   │   └── 其他: Redemption, Announcements
│   └── 主题切换器
│
├── 主内容区
│   ├── SearchModal（全局搜索）
│   └── {children}  ← 页面内容
│
└── RealTimeNotification（WebSocket 实时推送）
```

**相关文件：** `components/layout/AppLayout.tsx`, `Sidebar.tsx`, `SearchModal.tsx`

### 2.3 Admin 布局（管理后台）

```
AdminRoute (权限守卫)
└── AppLayout
    ├── Sidebar（左侧导航）
    │   ├── 运营总览
    │   ├── 用户管理
    │   ├── 供应商与模型
    │   ├── 财务管理
    │   ├── 营销运营
    │   ├── 安全风控
    │   ├── 监控日志
    │   ├── 系统配置
    │   └── 运维配置
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

## 五、路由配置（App.tsx）

```typescript
// 路由结构概览（基于 App.tsx 实际代码）

<Routes>
  {/* Portal 公开路由 */}
  <Route element={<PublicLayout />}>
    <Route path="/" element={<Home />} />
    <Route path="/models" element={<Models />} />
    <Route path="/pricing" element={<Pricing />} />
    <Route path="/docs" element={<Docs />} />
    <Route path="/status" element={<Status />} />
  </Route>

  {/* 认证路由 */}
  <Route path="/login" element={<Login />} />
  <Route path="/register" element={<Register />} />
  <Route path="/forgot-password" element={<ForgotPassword />} />
  <Route path="/reset-password" element={<ResetPassword />} />

  {/* 用户端路由 */}
  <Route element={<AppLayout />}>
    <Route path="/dashboard" element={<Dashboard />} />
    <Route path="/api-keys" element={<ApiKeys />} />
    <Route path="/models" element={<AppModels />} />
    <Route path="/logs" element={<Logs />} />
    {/* ... 其他用户端路由 */}
  </Route>

  {/* 管理后台路由（AdminRoute 权限守卫） */}
  <Route element={<AdminRoute />}>
    <Route element={<AppLayout />}>
      <Route path="/admin/dashboard" element={<AdminDashboard />} />
      <Route path="/admin/users" element={<UsersPage />} />
      <Route path="/admin/vendors" element={<Vendors />} />
      {/* ... 40+ 管理后台路由 */}
    </Route>
  </Route>

  {/* 代理端路由 */}
  <Route element={<AgentRoute />}>
    <Route element={<AppLayout />}>
      <Route path="/agent/dashboard" element={<AgentDashboard />} />
      <Route path="/agent/clients" element={<Clients />} />
      {/* ... 代理端路由 */}
    </Route>
  </Route>

  {/* 供应商端路由 */}
  <Route element={<VendorRoute />}>
    <Route element={<VendorLayout />}>
      <Route path="/vendor/dashboard" element={<VendorDashboard />} />
      <Route path="/vendor/login" element={<VendorLogin />} />
      {/* ... 供应商端路由 */}
    </Route>
  </Route>
</Routes>
```

---

## 六、页面统计

| 终端 | 页面数 | 主要文件 |
|------|--------|---------|
| Portal | 5 | `pages/portal/` |
| 认证 | 4 | `pages/Login.tsx`, `Register.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx` |
| 用户端 | 20+ | `pages/Dashboard.tsx`, `ApiKeys.tsx`, `Logs.tsx` 等 |
| 管理后台 | 43 | `pages/admin/`（含子目录） |
| 代理端 | 10 | `pages/agent/` |
| 供应商端 | 4 | `pages/vendor/` |
| 控制台 | 1 | `pages/console/` |
| **合计** | **~87** | 全栈页面 |

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