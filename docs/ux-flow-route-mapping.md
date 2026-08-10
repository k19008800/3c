# 3cloud UX Flow → Route 映射表

> 来源：`kb/3cloud/ux-flows.md`（16 条跨页面流程）
> 目标：每条流程在 web-console 中的路由和页面映射
> 状态：✅=路由就绪 | 🔧=需新建页面 | ⚠️=路由缺失
> **注意（2026-08-10 收敛后）**：web-console 是唯一业务应用，基路径 `/app/`，下表路由均位于 `/app/` 下（如 `/register` = `/app/register`）。旧 Portal 入口 URL 已由 web-portal `redirects()` 308 → `/app/*`。

---

## Portal 流程（F1-F6, F12-F13, F16）

### F1. 新用户完整链路：注册→实名→建Key→开始用

| 步骤 | 路由 | 现有页面 | 需要 UX 组件 |
|------|------|:---:|------|
| 注册 | `/register` | ✅ RegisterPage（已挂载，调 `/auth/register`） | 强度条, FormField, Toast |
| 控制台 | `/` | ✅ DashboardPage | 引导横幅（需新建 OnboardingBanner） |
| 实名认证 | `/real-name` | ✅ RealNamePage | FormField, Toast, Modal(审核状态) |
| API Key | `/api-keys` | ✅ ApiKeysPage | Modal(创建弹窗), CopyButton, Toast |

### F2. 登录→2FA→会话

| 步骤 | 路由 | 现有页面 | 需要 UX 组件 |
|------|------|:---:|------|
| 登录 | `/login` | ✅ LoginPage | FormField, Toast |
| 2FA | `/login`（模态） | 🔧 需加 2FA Modal（已知缺口：console LoginPage 无 totpEnabled 分支；启用 2FA 的用户登录不弹挑战） | Modal, FormField |
| 安全中心 | `/security` | ✅ SecurityPage | Table(会话列表), ConfirmPopover |

### F3. 创建&配置 API Key 全流程

| 步骤 | 路由 | 现有页面 | 需要 UX 组件 |
|------|------|:---:|------|
| Key 列表 | `/api-keys` | ✅ ApiKeysPage | Table, Pagination, SearchBar, StatusBadge |
| 创建 Key | 弹窗 | 🔧 需改造 | Modal, FormField, CopyButton |
| 一键重置 | 弹窗 | 🔧 需改造 | ConfirmPopover |

### F4. 充值→支付回调→到账→通知

| 步骤 | 路由 | 现有页面 | 需要 UX 组件 |
|------|------|:---:|------|
| 充值 | `/recharge` | ✅ RechargePage | FormField, Toast |
| 充值记录 | `/billing`（含充值记录） | ✅ BillingPage | Table, Pagination, StatusBadge, FilterBar |

### F5. 消费统计→下钻→导出

| 步骤 | 路由 | 现有页面 | 需要 UX 组件 |
|------|------|:---:|------|
| 调用日志 | `/logs` | ✅ LogsPage | Table, Pagination, FilterBar, SearchBar |
| 从 Dashboard 跳转 | `/` → `/logs?time=xxx` | 🔧 需加跳转参数 | Skeleton |

### F6. 工单提报→解决（跨 Portal/Admin）

| 步骤 | 路由 | 现有页面 | 需要 UX 组件 |
|------|------|:---:|------|
| Portal 工单 | `/tickets` | ✅ TicketsPage | Table, Pagination, Modal, FormField |
| Admin 工单 | `/admin/tickets` | ✅ AdminTicketsPage | Table, Pagination, StatusBadge |

### F12. 第三方登录/OAuth

| 步骤 | 路由 | 现有页面 | 需要 UX 组件 |
|------|------|:---:|------|
| OAuth 入口 | `/login`（按钮） | 🔧 需加 OAuth 按钮 | — |
| 绑定管理 | `/security` | ✅ SecurityPage | — |

### F13. 安全自愈链路：忘密/丢2FA/异常登录

| 步骤 | 路由 | 现有页面 | 需要 UX 组件 |
|------|------|:---:|------|
| 忘记密码 | `/login`（流程） | 🔧 需加忘记密码流程 | Modal, FormField, Toast |
| 异常登录通知 | `/notification` | ✅ NotificationPage | EmptyState |
| 安全中心 | `/security` | ✅ SecurityPage | ConfirmPopover |

### F16. 账号注销 & 数据导出

| 步骤 | 路由 | 现有页面 | 需要 UX 组件 |
|------|------|:---:|------|
| 安全中心入口 | `/security` | ✅ SecurityPage | ConfirmPopover, Modal |
| 注销待确认 | `/account-deletion` | ✅ DeletionPage | EmptyState, Skeleton |
| 数据导出 | `/data-export` | ✅ ConsentPage（复用） | FormField, Toast |

---

## Agent 流程（F7-F8）

### F7. 代理商经营主链路

| 步骤 | 路由 | 现有页面 | 需要 UX 组件 |
|------|------|:---:|------|
| 控制台 | `/agent/settings`（合并） | ✅ AgentSettingsPage | Skeleton, EmptyState |
| 客户管理 | ⚠️ 缺 `/agent/customers` | 🔧 需新建 | Table, Pagination, SearchBar |
| 消费追踪 | ⚠️ 缺 `/agent/consumption` | 🔧 需新建 | Table, FilterBar, Pagination |
| 佣金中心 | ⚠️ 缺 `/agent/commission` | 🔧 需新建 | Table, Pagination, StatusBadge |
| 提现 | ⚠️ 缺 `/agent/withdraw` | 🔧 需新建 | FormField, Toast, Modal |
| 结算对账 | `/agent/settlements` | ✅ AgentSettlementPage | Table, Pagination |

### F8. 代理商提现全链路

| 步骤 | 路由 | 现有页面 | 需要 UX 组件 |
|------|------|:---:|------|
| 提现提交 | `/agent/withdraw` | 🔧 需新建 | FormField, Toast |
| Admin 审核 | `/admin/withdrawals` | ✅ AdminWithdrawalsPage | Modal(审核弹窗), StatusBadge |

---

## Admin 流程（F9-F11, F14-F15）

### F9. 审核类统一框架

| 审核类型 | 路由 | 现有页面 | 需要 UX 组件 |
|---------|------|:---:|------|
| 实名认证 | `/admin/real-name` | ✅ AdminRealNamePage | Table, Modal(审核弹窗), StatusBadge |
| 人工上账 | `/admin/finance` | ✅ AdminFinancePage | FormField, Modal, Toast |
| 发票 | `/admin/invoices` | ✅ AdminInvoicesPage | Table, Pagination, Modal |

### F10. 告警→客户处置闭环

| 步骤 | 路由 | 现有页面 | 需要 UX 组件 |
|------|------|:---:|------|
| 数据看板 | `/admin/dashboard`（嵌入） | 🔧 需 Dashboard 页面 | Skeleton, EmptyState |
| 风控事件 | ⚠️ 缺 `/admin/risk` | 🔧 需新建 | Table, FilterBar, Modal, ConfirmPopover |
| 客户详情 | `/admin/customers` | ✅ AdminCustomersPage | Modal(处置弹窗), StatusBadge |

### F11. 客户全生命周期诊断

| 步骤 | 路由 | 现有页面 | 需要 UX 组件 |
|------|------|:---:|------|
| 客户列表 | `/admin/customers` | ✅ AdminCustomersPage | Table, Pagination, SearchBar, FilterBar |
| 客户详情 | `/admin/customers/:id`（弹窗） | 🔧 需改造 | Modal, FormField, StatusBadge |

### F14. 用户选择厂商调用全链路

| 步骤 | 路由 | 现有页面 | 需要 UX 组件 |
|------|------|:---:|------|
| 厂商选择器 | Portal 内嵌组件 | 🔧 需新建 VendorSelector | Skeleton, StatusBadge |
| 厂商资料 | `/admin/vendors` | ✅ AdminVendorsPage | Table, Modal |
| 厂商定价 | `/admin/models`（合并） | ✅ AdminModelsPage | Table, Modal, FilterBar |

### F15. 厂商定价→审批→生效

| 步骤 | 路由 | 现有页面 | 需要 UX 组件 |
|------|------|:---:|------|
| 定价管理 | `/admin/models` | ✅ AdminModelsPage | Modal(调价弹窗), StatusBadge |
| 调价审批 | 弹窗/流程 | 🔧 需改造 | Modal, StatusBadge, Toast |

---

## 路由缺失汇总

| # | 缺失路由 | 对应流程 | 优先级 |
|---|---------|---------|:---:|
| 1 | `/agent/customers` | F7 客户管理 | P0 |
| 2 | `/agent/consumption` | F7 消费追踪 | P0 |
| 3 | `/agent/commission` | F7 佣金中心 | P0 |
| 4 | `/agent/withdraw` | F7 提现 | P0 |
| 5 | `/admin/risk` | F10 风控 | P0 |
| 6 | `/admin/dashboard`（嵌入页） | F10 数据看板 | P1 |
| 7 | `/register`（独立注册页） | F1 注册 | ✅ 已完成（/app/register，RegisterPage 已挂载） |
| 8 | Portal 厂商选择器组件 | F14 | P1 |

---

## UX 组件使用频率

| 组件 | 引用次数 | 说明 |
|------|:---:|------|
| Table | 15 | 几乎所有列表页 |
| Pagination | 13 | 配合 Table |
| Modal | 13 | 弹窗/审核/创建 |
| FormField | 10 | 表单校验 |
| Toast | 9 | 操作反馈 |
| StatusBadge | 8 | 状态标签 |
| SearchBar | 4 | 搜索 |
| FilterBar | 4 | 筛选 |
| Skeleton | 4 | 加载态 |
| EmptyState | 4 | 空数据 |
| ConfirmPopover | 4 | 危险操作确认 |
| HelpIcon | 全部 | 每页必有（P1 要求） |
| CopyButton | 2 | Key/订单号复制 |

---

> 更新：2026-08-07 | 基于 ux-flows.md
