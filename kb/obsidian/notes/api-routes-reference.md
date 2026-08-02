---
title: "Api Routes Reference"
date: 2026-07-25
tags: [kb]
---
# 3cloud API 路由参考文档

> 基于 2026-07-15 全链路回归测试实际验证结果
> 注意：全项目普遍使用 `PATCH` 而非 `PUT`

---

## 认证 & 安全

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/auth/login` | POST | 登录 |
| `/api/v1/auth/register` | POST | 注册 |
| `/api/v1/auth/me` | GET | 当前用户信息 |
| `/api/v1/auth/change-password` | POST | 修改密码 |
| `/api/v1/auth/security/login-history` | GET | 登录历史（非 `/auth/security-log`）|
| `/api/v1/auth/security/sessions` | GET | 活跃会话（非 `/auth/security-settings`）|
| `/api/v1/auth/security/logout-all` | POST | 撤销所有会话 |

## API Key

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/api-keys` | GET | 列表 |
| `/api/v1/api-keys` | POST | 创建 |
| `/api/v1/api-keys/:id` | **PATCH** | 更新（非 PUT）|
| `/api/v1/api-keys/:id` | DELETE | 删除 |
| `/api/v1/api-keys/:id/usage` | GET | 用量（深度面板）|
| `/api/v1/api-keys/:id/models` | GET | 模型分布 |
| `/api/v1/api-keys/:id/hourly` | GET | 24h 热力图 |
| `/api/v1/api-keys/:id/download` | GET | CSV 导出 |

## 管理者 API Key

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/api-keys` | GET | 列表 |
| `/api/v1/admin/api-keys/:id` | GET | 详情 |
| `/api/v1/admin/api-keys/:id` | PUT | 更新（需 super_admin + CONFIG_EDIT）|

## 角色权限

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/roles` | GET | 角色列表 |
| `/api/v1/admin/roles` | POST | 创建角色 |
| `/api/v1/admin/roles/:id` | GET | 角色详情 |
| `/api/v1/admin/roles/:id` | **PATCH** | 更新角色（非 PUT）|
| `/api/v1/admin/roles/:id` | DELETE | 删除角色 |
| `/api/v1/admin/roles/users/:roleId` | GET | 角色下用户列表 |
| `/api/v1/admin/roles/permissions/list` | GET | 权限位清单 |
| `/api/v1/admin/roles/:id/users/:userId` | POST | 分配用户到角色 |
| `/api/v1/admin/roles/:id/users/:userId` | DELETE | 从角色移除用户 |

## 用户管理

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/users` | GET | 列表（分页 + 搜索 + 筛选）|
| `/api/v1/admin/users` | POST | 创建 |
| `/api/v1/admin/users/:id` | GET | 详情 |
| `/api/v1/admin/users/:id` | **PATCH** | 更新（非 PUT）|
| `/api/v1/admin/users/export` | GET | 导出 CSV |

## 额度管理

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/quotas` | GET | 列表 |
| `/api/v1/admin/quotas` | POST | 创建 |
| `/api/v1/admin/quotas/:id` | PUT | 更新 |

## 实名审核

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/real-name-review` | GET | 审核列表 |
| `/api/v1/admin/real-name-review/detail/:userId` | GET | 审核详情 |
| `/api/v1/admin/real-name-reviews` | GET | 审核列表（新版）|
| `/api/v1/admin/real-name-review/:id` | POST | 审核操作（approve/reject）|

## 供应商管理

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/vendors` | GET | 列表 |
| `/api/v1/admin/vendors` | POST | 创建 |
| `/api/v1/admin/vendors/:id` | GET | 详情 |
| `/api/v1/admin/vendors/:id` | **PATCH** | 更新（非 PUT）|
| `/api/v1/admin/vendors/:id` | DELETE | 删除 |
| `/api/v1/admin/vendors/:id/models` | GET | 行内模型明细 |
| `/api/v1/admin/vendors/stats` | GET | 统计卡片 |

## 供应商-模型映射

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/vendor-models` | GET | 列表 |
| `/api/v1/admin/vendor-models` | POST | 创建 |
| `/api/v1/admin/vendor-models/:id` | **PATCH** | 更新（非 PUT）|
| `/api/v1/admin/vendor-models/test` | POST | 连通性测试（无 :id）|
| `/api/v1/admin/vendor-models/by-vendor/:vendorId` | GET | 按供应商查映射 |

## 模型管理

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/models` | GET | 列表（分页 + 搜索 + 筛选）|
| `/api/v1/admin/models` | POST | 创建 |
| `/api/v1/admin/models/:id` | **GET** | 详情（⚠️ 2026-07-15 新增）|
| `/api/v1/admin/models/:id` | **PATCH** | 更新（非 PUT）|
| `/api/v1/admin/models/:id` | DELETE | 删除 |
| `/api/v1/admin/models/:id/usage` | GET | 用量分析 |

## 公开模型

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/models` | GET | 用户可见模型列表 |
| `/api/v1/models/:id` | GET | 模型详情 |

## 限流管理

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/rate-limits/rules` | **GET** | 规则 + 水位统计（非 `/rate-limits`）|
| `/api/v1/admin/rate-limits/rules` | **PATCH** | 批量更新规则（非 POST）|
| `/api/v1/admin/rate-limits/overrides` | GET | 用户覆盖规则列表 |
| `/api/v1/admin/rate-limits/overrides` | POST | 设置/更新用户级 RPM/TPM（支持 UPSERT）|
| `/api/v1/admin/rate-limits/overrides/:id` | DELETE | 删除覆盖 |
| `/api/v1/admin/rate-limits/hits` | GET | 限流命中事件 |

## 熔断器管理

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/circuit-breakers` | GET | 列表（非 `/circuits`）|
| `/api/v1/admin/circuit-breakers/:id` | GET | 详情 |
| `/api/v1/admin/circuit-breakers/:id/reset` | POST | 手动恢复熔断 |
| `/api/v1/admin/circuit-breakers/:id/config` | POST | 更新熔断配置 |
| `/api/v1/admin/circuit-breakers/summary` | GET | 熔断概览 |
| `/api/v1/admin/circuit-breakers/history` | GET | 熔断历史 |

## 代理转发

| 路径 | 方法 | 认证方式 | 说明 |
|------|------|----------|------|
| `/api/v1/chat/completions` | POST | API Key | 聊天补全（非 `/proxy/chat`）|
| `/api/v1/vendor` | POST | API Key | 供应商路由 |

## 供应商自助

| 路径 | 方法 | 认证方式 | 说明 |
|------|------|----------|------|
| `/api/vendor/me` | GET/PUT | X-Vendor-Key | 非 `/api/v1/vendor/self` |

## 财务工作台

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/finance/dashboard` | GET | 财务总览 |
| `/api/v1/admin/finance/commissions` | GET | 佣金流水 |

## 对账报表

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/finance/reconciliation` | GET | 对账报表 |

## 成本看板

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/finance/codes/cost-overview` | GET | 兑换码成本概览（非 `/code-cost`）|
| `/api/v1/admin/finance/agent-cost` | GET | Agent 成本明细 |
| `/api/v1/admin/finance/admin-cost` | GET | Admin 成本明细 |
| `/api/v1/admin/finance/codes/agent-settlement` | GET | 代理结算列表 |
| `/api/v1/admin/finance/codes/agent-settlement/:id` | GET | 结算详情 |
| `/api/v1/admin/finance/codes/agent-ledger/:id` | GET | 资金流水 |

## 利润分析

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/finance/profit?period=` | GET | 利润分析 |
| `/api/v1/admin/finance/profit/summary` | GET | 利润汇总（需 granularity）|
| `/api/v1/admin/finance/profit/trend` | GET | 利润趋势 |
| `/api/v1/admin/finance/profit/low-margin` | GET | 低利润模型 |

## 价格管理

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/finance/prices` | GET | 价格列表 |
| `/api/v1/admin/finance/prices/history` | GET | 价格历史 |

## 发票

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/finance/invoices` | GET | 管理端发票列表 |
| `/api/v1/invoices` | GET | 用户端发票列表 |
| `/api/v1/invoices/available-amount` | GET | 可开票金额 |
| `/api/v1/invoices/apply` | POST | 申请开票 |

## 退款

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/finance/refunds` | GET | 管理端退款列表 |
| `/api/v1/admin/finance/refunds/:id` | GET | 退款详情 |
| `/api/v1/refunds` | GET/POST | 用户端退款列表/申请 |

## 充值订单

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/recharge-orders` | GET | 充值订单列表 |
| `/api/v1/admin/recharge-orders/:id` | GET | 订单详情 |
| `/api/v1/recharge/orders` | GET | 用户端充值订单 |
| `/api/v1/recharge/bank-transfer` | POST | 银行转账充值 |

## 兑换码

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/redemption/codes` | GET | 兑换码列表 |
| `/api/v1/admin/redemption` | POST | 创建兑换码 |
| `/api/v1/redemption/codes` | GET | 用户端兑换码列表 |
| `/api/v1/redemption/redeem` | POST | 用户端兑换 |
| `/api/v1/redemption/stats` | GET | 兑换统计 |

## 提现

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/withdraws` | GET | 提现管理列表 |
| `/api/v1/admin/withdraws/stats` | GET | 提现统计 |
| `/api/v1/agent/withdraws` | GET | 代理端提现列表 |
| `/api/v1/agent/withdraw` | POST | 代理发起提现 |

## 代理商

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/agent/dashboard` | GET | 代理商仪表盘 |
| `/api/v1/agent/dashboard/income-trend` | GET | 收入趋势 |
| `/api/v1/agent/dashboard/income-structure` | GET | 收入结构 |
| `/api/v1/agent/commissions` | GET | 佣金列表 |
| `/api/v1/agent/commissions/summary` | GET | 佣金汇总 |
| `/api/v1/agent/referral-link` | GET | 推广链接 |
| `/api/v1/agent/bank-info` | GET | 银行信息 |

## 安全风控

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/security/dashboard` | GET | 安全总览 |
| `/api/v1/admin/security/events` | GET | 安全事件 |
| `/api/v1/admin/security/config` | GET | 安全配置 |
| `/api/v1/admin/security/config/history` | GET | 配置变更历史 |
| `/api/v1/admin/security/bans` | GET | 封禁列表 |
| `/api/v1/admin/security/bans/ip` | POST | IP 封禁 |
| `/api/v1/admin/security/bans/user` | POST | 用户封禁 |
| `/api/v1/admin/security/unban/ip` | POST | IP 解封 |
| `/api/v1/admin/security/unban/user` | POST | 用户解封 |
| `/api/v1/admin/security/events/:id/ack` | POST | 确认事件 |
| `/api/v1/admin/security/events/batch-ack` | POST | 批量确认 |
| `/api/v1/admin/security/circuits` | GET | 安全熔断 |
| `/api/v1/admin/security/test-alert` | POST | 测试告警 |

## 审计日志

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/audit-logs` | GET | 列表 |
| `/api/v1/admin/audit-logs/:id` | GET | 详情 |
| `/api/v1/admin/audit-logs/export` | GET | 导出 |

## 操作日志

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/operation-logs` | GET | 管理端列表 |
| `/api/v1/admin/operation-logs/export` | GET | 导出 CSV |
| `/api/v1/me/operation-logs` | GET | 用户端列表（非 `/api/v1/operation-logs`）|

## 调用日志

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/logs` | GET | 管理端列表 |
| `/api/v1/admin/logs/analytics` | GET | 日志分析 |
| `/api/v1/admin/logs/analytics/export` | GET | 分析导出 |
| `/api/v1/logs` | GET | 用户端列表 |
| `/api/v1/logs/summary` | GET | 日志汇总 |
| `/api/v1/logs/trends` | GET | 日志趋势 |
| `/api/v1/logs/stats/by-model` | GET | 按模型统计 |
| `/api/v1/logs/export` | GET | 用户端导出 |
| `/api/v1/logs/anomalies` | GET | 异常检测 |

## 聚合统计

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/stats` | GET | 总览 |
| `/api/v1/admin/stats/overview` | GET | 概览 |
| `/api/v1/admin/stats/by-model` | GET | 按模型 |
| `/api/v1/admin/stats/by-vendor` | GET | 按供应商 |
| `/api/v1/admin/stats/by-user` | GET | 按用户 |
| `/api/v1/admin/stats/hourly` | GET | 小时级 |
| `/api/v1/admin/stats/trend` | GET | 趋势 |
| `/api/v1/admin/stats/export` | GET | 导出 |
| `/api/v1/admin/stats/usage/summary` | GET | 用量汇总 |
| `/api/v1/stats` | GET | 用户端统计 |

## 通知中心

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/auth/notifications` | GET | 用户端列表 |
| `/api/v1/auth/notifications/read` | POST | 标记已读 |
| `/api/v1/me/notifications` | GET | 用户端列表（备用路径）|
| `/api/v1/me/notifications/:id/read` | PUT | 单条已读 |
| `/api/v1/me/notifications/read-all` | PUT | 全部已读 |
| `/api/v1/me/notifications/unread-count` | GET | 未读数 |
| `/api/v1/admin/notifications/announcement` | POST | 管理员广播 |

## 公告

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/announcements` | GET/POST | 管理端列表/创建 |
| `/api/v1/admin/announcements/:id` | PATCH/DELETE | 更新/删除 |
| `/api/v1/announcements` | GET | 用户端列表 |

## 营销活动

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/campaigns` | GET/POST | 列表/创建 |
| `/api/v1/admin/campaigns/:id` | GET | 详情 |
| `/api/v1/admin/campaigns/stats` | GET | 活动统计 |

## 邮件模板

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/email-templates` | GET/POST | 列表/创建 |
| `/api/v1/admin/email-templates/:name` | PUT/DELETE | 更新/删除 |

## 页面内容

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/page-contents` | GET/POST | 列表/创建 |
| `/api/v1/admin/page-contents/:id` | PATCH/DELETE | 更新/删除 |

## 系统

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/configs` | GET | 系统配置列表 |
| `/api/v1/admin/configs/:key` | PATCH | 更新配置 |
| `/api/v1/admin/configs/security-audit` | GET | 安全审计报告 |
| `/api/v1/admin/perf-cache-stats` | GET | 性能缓存统计 |
| `/health` | GET | 健康检查 |
| `/ready` | GET | 就绪检查 |

## 用户偏好

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/preferences/user-list` | GET/PUT | 筛选偏好持久化 |
