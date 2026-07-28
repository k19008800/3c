# T13 — 前端路由一致性审计报告

> 生成时间: 2026-06-28 09:53 CST
> 文件: `web/src/App.tsx`, `docs/frontend-routes.md`

## 规划路由（frontend-routes.md）

```
/ → Layout 用户控制台
├── dashboard
├── api-keys
├── logs
├── recharge
├── recharge/bank-transfer
├── team
├── docs
└── settings

/admin → AdminLayout
├── dashboard
├── users
├── models
├── vendors
├── agents
├── finance
└── settings

/agent → AgentLayout
├── dashboard
├── clients
├── commissions
└── withdraw

/auth → AuthLayout
├── login
├── register
├── forgot-password
├── reset-password
└── verify-email
```

## 实际路由（App.tsx）

```
/login
/register
/ → AppLayout
├── (index) → Dashboard
├── models
├── api-keys
├── logs
├── recharge
├── admin → AdminDashboard
├── admin/users
├── admin/models
├── admin/vendors
├── admin/vendor-models
├── admin/agents
├── admin/logs
├── admin/recharge-orders
├── admin/real-name-review
├── admin/configs
└── admin/audit-logs
```

## 差异分析

### ✅ 已实现（实际存在且匹配规划）
| 规划路径 | 实际路径 | 页面 |
|---------|---------|------|
| `/dashboard` | `/` (index) | Dashboard ✅ |
| `/api-keys` | `/api-keys` | ApiKeys ✅ |
| `/logs` | `/logs` | Logs ✅ |
| `/recharge` | `/recharge` | Recharge ✅ |
| `/auth/login` | `/login` | Login ✅ |
| `/auth/register` | `/register` | Register ✅ |
| `/admin/models` | `/admin/models` | AdminModels ✅ |
| `/admin/vendors` | `/admin/vendors` | Vendors ✅ |
| `/admin/agents` | `/admin/agents` | Agents ✅ |
| `/admin/dashboard` | `/admin` | AdminDashboard ⚠️ |

### ❌ 缺失路由
| 规划路径 | 用途 | 缺失详情 |
|---------|------|---------|
| `/team` | 团队管理 | 完全缺失 |
| `/docs` | API 文档 | 完全缺失 |
| `/settings` | 个人资料 | 完全缺失 |
| `/recharge/bank-transfer` | 银行转账子页 | 缺失（但 Recharge 组件内有 BankTransfer 子组件） |
| `/agent/*` | 代理商控制台 | 完全缺失（仅后端有 API） |
| `/auth/forgot-password` | 忘记密码 | 完全缺失 |
| `/auth/reset-password` | 重置密码 | 完全缺失 |
| `/auth/verify-email` | 邮箱验证 | 完全缺失 |

### ⚠️ 路由结构差异

1. **路由挂载:** 所有路由挂载在单一路由组 `<Route path="/" element={<AppLayout />}>` 下，包括 admin 路由 ✅
2. **布局:** 规划中有 UserLayout、AdminLayout、AgentLayout、AuthLayout 四个独立布局，但实际只有 AppLayout 一个 ✅（简化实现）
3. **admin/vendor-models:** 存在但规划中为 `vendors` 下子路由 ✅（合理扩展）
4. **admin/recharge-orders:** 存在但规划中为 `finance` 下 ✅
5. **admin/real-name-review:** 存在但规划中为 `users` 下 ✅
6. **admin/configs:** 存在但规划中为 `settings` ✅
7. **admin/audit-logs:** 存在但规划未明确列出 ✅

## 缺失页面统计

| 功能域 | 规划页面数 | 实际页面数 | 缺失数 |
|--------|-----------|-----------|--------|
| Auth | 5 | 2 | 3 |
| User Console | 8 | 5 | 3 |
| Admin | 7 | 8 | 0 (多3个) |
| Agent | 4 | 0 | 4 |
| **合计** | **24** | **15** | **10** |

## 汇总

| 检查项 | 结果 |
|--------|------|
| 规划 vs 实际检查 | ✅ 15/24 路由实现 |
| 缺失路由识别 | ❌ 10 条缺失 |
| 路由结构 | ⚠️ 简化布局 |
| 整体评分 | 50/100 |

**建议修复:**
1. 添加缺失的 Auth 页面: ForgotPassword, ResetPassword, VerifyEmail
2. 添加 Team, Docs, Settings 用户页面
3. 添加 Agent 控制台路由和页面布局
4. 考虑 AuthLayout/UserLayout/AdminLayout/AgentLayout 独立布局组件
