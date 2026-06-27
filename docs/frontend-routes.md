# 前端路由 & 组件树

> 路径：`3cloud/web/src/`
> 框架：React 18 + Vite + Ant Design 5 + react-router-dom 6

## 路由结构

```
/                          → Layout (用户控制台布局)
├── dashboard              → 控制台首页
├── api-keys               → API Key 管理
├── logs                   → 调用日志
├── recharge               → 充值
│   └── bank-transfer      → 对公转账
├── team                   → 团队管理（企业用户）
├── docs                   → API 文档
└── settings               → 个人资料

/admin                     → AdminLayout (管理后台布局)
├── dashboard              → 管理首页
├── users                  → 用户管理
│   └── :id                → 用户详情弹窗（路由级）
├── models                 → 模型管理
├── vendors                → 厂商管理
├── agents                 → 代理商管理
├── finance                → 财务管理
│   └── withdraw-review    → 提现审核
└── settings               → 系统配置

/agent                     → AgentLayout (代理商布局)
├── dashboard              → 代理商首页
├── clients                → 名下客户
├── commissions            → 分佣记录
└── withdraw               → 提现

/auth                      → AuthLayout (无需登录)
├── login                  → 登录
├── register               → 注册
├── forgot-password        → 忘记密码
├── reset-password         → 重置密码（token）
└── verify-email           → 邮箱验证
```

## 组件树

### 用户控制台（7 页）

```
pages/
├── user/
│   ├── Dashboard.tsx
│   │   ├── BalanceCard         — 余额卡片
│   │   ├── UsageCard           — 今日用量卡片
│   │   ├── KeyCountCard        — Key 数量卡片
│   │   ├── UsageTrendChart     — 7 天趋势图 (ECharts/Chart.js)
│   │   └── RecentCallsTable    — 最近调用列表
│   │
│   ├── ApiKeys.tsx
│   │   ├── ApiKeyTable         — ProTable (名称/前缀/状态/最后使用)
│   │   ├── CreateKeyModal      — 弹窗创建 Key
│   │   └── KeyConsumptionDrawer— 侧滑查看 Key 消费
│   │
│   ├── Logs.tsx
│   │   ├── LogFilterBar        — 时间/模型/厂商/状态筛选
│   │   ├── CallLogTable        — ProTable 调用日志列表
│   │   └── ExportButton        — CSV 导出
│   │
│   ├── Recharge.tsx
│   │   ├── AmountInput         — 金额输入
│   │   ├── PayMethodSelector   — 微信/支付宝/对公转账 Tab
│   │   ├── QrCodePanel         — PC 扫码二维码
│   │   ├── JsapiPanel          — 手机 JSAPI 调起
│   │   ├── BankTransferForm    — 对公转账表单 + 凭证上传
│   │   └── RechargeHistoryTable— 充值记录
│   │
│   ├── Team.tsx
│   │   ├── TeamInfoCard        — 团队信息
│   │   ├── MemberTable         — 成员列表
│   │   ├── InviteMemberModal   — 生成邀请链接
│   │   └── QuotaEditor         — 成员额度编辑
│   │
│   ├── Docs.tsx
│   │   └── MarkdownRenderer    — 后台可编辑 Markdown 渲染
│   │
│   └── Settings.tsx
│       ├── ProfileForm         — 修改信息
│       ├── PasswordForm        — 修改密码
│       └── RealNameStatus      — 实名状态展示
```

### 管理后台（7 页）

```
pages/
├── admin/
│   ├── Dashboard.tsx
│   │   ├── StatCards           — 4 卡片（总用户/今日调用/今日收入/厂商健康）
│   │   ├── PendingList         — 待审核实名/提现/异常告警
│   │   ├── TrendsChart         — 调用/收入/用户增长趋势
│   │   ├── HeatmapChart        — 调用热力图（小时-日维度）
│   │   ├── TopUsersTable       — Top 5 消费者
│   │   └── RecentFailuresTable — 最近失败请求
│   │
│   ├── Users.tsx
│   │   ├── UserFilterBar       — 搜索/筛选
│   │   ├── UserProTable        — ProTable 用户列表
│   │   ├── UserDetailDrawer    — 用户详情弹窗
│   │   ├── ManualRechargeModal — 手动充值
│   │   ├── DiscountEditor      — 折扣设置
│   │   ├── RateLimitOverride   — 限流覆盖
│   │   ├── ResetPasswordModal  — 重置密码
│   │   └── RealNameReviewTab   — 实名审核 Tab
│   │
│   ├── Models.tsx
│   │   ├── ModelCardList       — 模型卡片列表
│   │   ├── ModelFormModal      — 新增/编辑模型
│   │   └── VendorModelTable    — 厂商-模型定价表
│   │
│   ├── Vendors.tsx
│   │   ├── VendorList          — 厂商列表
│   │   └── VendorFormModal     — 新增/编辑厂商（API Key 维护）
│   │
│   ├── Agents.tsx
│   │   ├── AgentProTable       — ProTable 代理商列表
│   │   ├── AgentFormModal      — 新增/编辑代理商
│   │   ├── ClientAssignment    — 客户分配
│   │   └── WithdrawReviewTable — 提现审核
│   │
│   ├── Finance.tsx
│   │   ├── TransactionTable    — 交易流水
│   │   ├── BankTransferReview  — 线下入账审核
│   │   └── ExportButton        — 对账 CSV 导出
│   │
│   └── SystemSettings.tsx
│       ├── RateLimitConfig     — 限流默认值设置
│       ├── AlertThresholdConfig— 告警阈值
│       ├── PricingConfig       — 定价倍率
│       ├── PaymentConfig       — 支付密钥
│       ├── EmailConfig         — 邮件 SMTP
│       ├── AgentConfig         — 日提现次数
│       ├── TrialConfig         — 免费体验额度/有效期
│       ├── EmailTemplateEditor — 邮件模板 HTML 编辑 + 预览
│       └── ContentEditor       — 内容管理（Markdown 编辑）
```

### 代理商控制台（4 页）

```
pages/
├── agent/
│   ├── Dashboard.tsx
│   │   └── AgentStatCards      — 4 卡片（客户数/本月消费/累计分佣/可提现）
│   │
│   ├── Clients.tsx
│   │   ├── ClientProTable      — 客户列表
│   │   └── ClientConsumption   — 客户消费明细
│   │
│   ├── Commissions.tsx
│   │   ├── CommissionFilterBar — 筛选
│   │   ├── CommissionTable     — 分佣记录
│   │   └── ExportButton        — CSV 导出
│   │
│   └── Withdraw.tsx
│       ├── WithdrawForm        — 发起提现（≥50 元）
│       └── WithdrawHistoryTable— 提现记录
```

### 通用组件

```
components/
├── layout/
│   ├── UserLayout.tsx          — 用户控制台布局（侧边栏 + Header + 内容区）
│   ├── AdminLayout.tsx         — 管理后台布局
│   ├── AgentLayout.tsx         — 代理商布局
│   ├── AuthLayout.tsx          — 登录/注册布局
│   └── Header.tsx              — 顶部栏（语言切换 + 用户信息 + 退出）
│
├── common/
│   ├── BalanceDisplay.tsx      — 余额展示组件（含低余额警告）
│   ├── PaginationTable.tsx     — 通用分页表格封装
│   ├── StatusBadge.tsx         — 状态标签（成功/失败/待审等）
│   ├── FileUploader.tsx        — 文件上传控件（实名图片/转账凭证）
│   ├── CopyButton.tsx          — 复制到剪贴板
│   └── ConfirmModal.tsx        — 二次确认弹窗

hooks/
├── useAuth.ts                  — 鉴权 hook（Token 管理 / 自动刷新）
├── useI18n.ts                  — 国际化 hook
└── usePagination.ts            — 分页状态管理

i18n/
├── zh-CN.json                  — 中文翻译
├── en.json                     — 英文翻译
└── index.ts                    — i18n 初始化
```

## 路由配置表

```typescript
// src/router.tsx
const routes = [
  // Auth
  { path: "/auth/login", element: <Login /> },
  { path: "/auth/register", element: <Register /> },
  { path: "/auth/forgot-password", element: <ForgotPassword /> },
  { path: "/auth/reset-password", element: <ResetPassword /> },
  { path: "/auth/verify-email", element: <VerifyEmail /> },

  // User Console (requires auth)
  { path: "/", element: <UserLayout />, children: [
    { index: true, redirect: "/dashboard" },
    { path: "dashboard", element: <Dashboard /> },
    { path: "api-keys", element: <ApiKeys /> },
    { path: "logs", element: <Logs /> },
    { path: "recharge", element: <Recharge /> },
    { path: "recharge/bank-transfer", element: <BankTransfer /> },
    { path: "team", element: <Team />, roles: ["enterprise"] },
    { path: "docs", element: <Docs /> },
    { path: "settings", element: <Settings /> },
  ] },

  // Admin (requires super_admin / admin)
  { path: "/admin", element: <AdminLayout />, children: [
    { index: true, redirect: "/admin/dashboard" },
    { path: "dashboard", element: <AdminDashboard /> },
    { path: "users", element: <AdminUsers /> },
    { path: "models", element: <AdminModels /> },
    { path: "vendors", element: <AdminVendors /> },
    { path: "agents", element: <AdminAgents /> },
    { path: "finance", element: <AdminFinance /> },
    { path: "settings", element: <SystemSettings /> },
  ] },

  // Agent Console (requires agent role)
  { path: "/agent", element: <AgentLayout />, children: [
    { index: true, redirect: "/agent/dashboard" },
    { path: "dashboard", element: <AgentDashboard /> },
    { path: "clients", element: <Clients /> },
    { path: "commissions", element: <Commissions /> },
    { path: "withdraw", element: <Withdraw /> },
  ] },
];
```
