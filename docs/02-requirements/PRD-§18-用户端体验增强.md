# §18 用户端体验增强（第一批）

- 品牌：浩寅云
- 代码基线：git HEAD `91f62d3`（2026-10-03，含 Step 4）
- 权威源：`api/src/routes/{me,me-gap,me-onboarding,recharge,me-budget}.ts`、`web-console/src/App.tsx` 路由表
- 状态图例：✅ 已实现 / 🟡 部分实现 / ❌ 未实现（规划中）

## 18.1 功能清单

| 编号 | 能力 | 代码落点 | 状态 | 差距说明 |
|---|---|---|---|---|
| 18.1 | API 在线调试 Playground | `PlaygroundPage.tsx`（模型选择/参数/调用/结果） | ✅ | 调试历史未持久化到后端 |
| 18.2 | 用量预算控制（消费熔断） | `me-budget.ts`：`GET/PUT /api/v1/me/budget`；表 `user_budget_settings`（migration 0042）；网关 pre-consume 前检查 | ✅ | Step 4 已上线：用户自设日/月预算，超限熔断拒绝请求；管理员侧预算总览端点待补（见 §20.1） |
| 18.3 | 注册引导 Onboarding（5 步） | `me-onboarding.ts`：status/step/skip/complete | ✅ | 前端 OnboardingWizard 已上线 |
| 18.4 | 账单与消费分析 | `me.ts`：`GET /me/billing/current`、`/current/daily`、`/history`、`/history/:month`、`/history/:month/download` | 🟡 | 月度账单+每日趋势+PDF 下载齐；缺成本优化建议卡片、本月 vs 上月环比图 |
| 18.5 | 通知偏好管理 | `me-gap.ts`：`/me/notification-settings/:type/email`、`/preferences/notifications` 读写/重置 | 🟡 | 分类开关+邮件渠道齐；缺"安全告警强制开启"差异化约束 |
| 18.6 | 账号安全中心 | `me.ts` 改密/改邮箱 + `me-gap.ts` 设备/登录历史 + `2fa.ts` | ✅ | 密码/会话设备/登录历史/2FA 在 `SecurityPage.tsx` 聚合 |
| 18.7 | 公开 API 状态页 | Portal `app/status/page.tsx`（`/status`） | 🟡 | 页面存在但是 CSR（use client）；后端 `GET /api/v1/public/status` 已返回基础设施+供应商+公告 top10，前端未渲染公告、无事件历史时间线 |
| 18.8 | 官方 SDK（5 语言） | — | ❌ | 仅 OpenAI/Anthropic 协议兼容，无 pip/npm 官方包 |

## 18.2 关键架构

- Playground 走 `/api/v1/v1/*` 内部别名直连网关（与外部 `/v1/*` 同一 handler），便于免鉴权联调。
- 预算熔断在网关 pre-consume 之前的中间件层读取 `user_budget_settings`，与余额预扣（Redis Lua 冻结）串联：先预算闸、后余额闸。
- 状态页数据源是 `public.ts` 的公开聚合端点，无需登录；SSR 化（force-dynamic）是后续优化项。

## 18.3 未实现项

| 优先级 | 事项 |
|---|---|
| P1 | Playground 调用历史持久化 |
| P1 | 账单页成本优化建议 + 环比对比图 |
| P1 | /status 页 SSR 化并渲染公告/事件时间线 |
| P2 | 官方 SDK（Python/Node/Go/Java 优先） |

> 前端页面必须按产品设计原则在标题/按钮旁落 `[?]` 帮助；Playground、账单页、安全中心、状态页为 `[?]` 落地重点核查页面。
