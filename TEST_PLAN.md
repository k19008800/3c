# 3cloud 前端 UI 交互全面测试计划

## 测试账号
| 角色 | 邮箱 | 密码 | 说明 |
|------|------|------|------|
| 超级管理员 | admin@3cloud.dev | admin123 | 全权限 admin |

## 模块分组

| 模块 | 包含页面 | 预估操作数 |
|------|---------|----------|
| M1. 登录/认证 | Login, Register, ForgotPassword, ResetPassword | 8 |
| M2. 控制台首页 | Dashboard, Models, ApiKeys | 12 |
| M3. 用户功能 | Logs, OperationLogs, Transactions, Recharge, RealName, Redemption, Docs | 15 |
| M4. 用户设置 | Security, Stats, Announcements, Notifications, Settings, Invoices, Refunds | 14 |
| M5. 管理后台-概览/资源 | AdminDashboard, AdminUsers, AdminModels, AdminVendors, AdminVendorModels | 20 |
| M6. 管理后台-财务 | FinanceDashboard, Commissions, Reconciliation, Settlement, CodeCost, AgentCost, AdminCost, ProfitAnalysis, Prices, Invoices, Refunds, Withdraws | 30 |
| M7. 管理后台-安全/风控 | SecurityDashboard, Events, Config, Bans, Alerts, AutoRules, EnterpriseAnalysis, CircuitBreakers | 16 |
| M8. 管理后台-系统 | Stats, Announcements, RedemptionCodes, AdminApiKeys, Quotas, RateLimits, Roles, Campaigns, VendorSelf, PageContents, SiteSettings, Playground, AuditLogs, OperationLogs, SystemHealth, EmailTemplates, Configs | 25 |
| M9. 代理商模块 | AgentDashboard, AgentClients, AgentCommissions, AgentWithdraw, AgentRedemption, AgentFinance, AgentReconciliation | 14 |
| M10. 门户页面 | PortalHome, Pricing, Docs, Models | 6 |

## 测试方法
1. 浏览器打开 http://localhost:5175
2. 登录 admin@3cloud.dev / admin123
3. 按模块逐一遍历每个页面、Tab、弹窗、按钮
4. 验证数据展示、交互逻辑、页面跳转
5. 记录缺陷和优化建议

## 缺陷模板
```
## [Mx-xx] 模块名 - 缺陷标题
- **位置**: 页面路径
- **类型**: UI/功能/逻辑/数据
- **现象**: 
- **预期**: 
- **建议**: 
```
