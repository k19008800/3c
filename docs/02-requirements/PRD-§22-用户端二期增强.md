# §22 用户端体验增强（第二批）

- 品牌：浩寅云
- 代码基线：git HEAD `91f62d3`（2026-10-03）
- 权威源：`api/src/routes/{me,me-gap,me-onboarding,webhooks,data-requests,data-export-grants,oauth}.ts`、`web-console/src/App.tsx`
- 状态图例：✅ 已实现 / 🟡 部分实现 / ❌ 未实现（规划中）

## 22.1 功能清单

| 编号 | 能力 | 代码落点 | 状态 | 差距说明 |
|---|---|---|---|---|
| 22.1 | 注册引导 Onboarding（5 步） | `me-onboarding.ts` | ✅ | 与 §18.3 同一套 |
| 22.2.1 | 仪表盘成本预测卡片 | — | ❌ | 仪表盘区域 11 未做 |
| 22.2.2 | 仪表盘异常告警卡片 | — | ❌ | 区域 12 未做 |
| 22.2.3 | 账单周期卡片 | `me.ts`：`GET /me/billing/current` | 🟡 | 后端当月账单齐；前端未做卡片化周期概览 |
| 22.2.4 | 实时活动流（LiveActivityFeed） | — | ❌ | WebSocket 推送实时事件未接前端（/v1/ws 为推理中继，见 §27 澄清） |
| 22.2.5 / 22.12 | 数据导出（申请/审批/下载/授权） | `data-requests.ts` 5 个 me 端点 + `data-export-grants.ts` 授权端点 | ✅ | 与 §33 被遗忘权共用 |
| 22.3 | 用户端 Playground | `PlaygroundPage.tsx` | ✅ | 同 §18.1 |
| 22.4 | 用户 Webhook 配置 | `webhooks.ts`：CRUD + regenerate-secret + test；`me-gap.ts` PATCH 启停 | ✅ | 入站事件推送（用户端），区别于 §16 全局出站 |
| 22.5 | 第三方 OAuth 登录 | `oauth.ts`：GitHub url/callback + bindings/bind/unbind | 🟡 | 仅 GitHub 真正接入；wechat/telegram/google 返回 501（OAuthNotImplementedError） |
| 22.6 | 通知偏好细分 | `me-gap.ts`：分类开关 + 邮件渠道 | ✅ | |
| 22.7 | API Key 操作日志 | — | ❌ | 无 `key_permission_changes` 表 / `/me/api-keys/:id/logs` |
| 22.8 | 用户邀请奖励 | 代理商侧 `agent.ts` 邀请码已落地 | 🟡 | 普通用户"邀请好友得额度"未做 |
| 22.9 | 用量对比分析 | `StatisticsPage.tsx` + `GET /me/stats` | 🟡 | 有日/周/月趋势与模型分布；缺多用户/多 Key 维度对比 |
| 22.10 | 错误码自助排障 | — | ❌ | 无错误码检索页（错误码规范见 §14） |
| 22.11 | 批量操作 | `me.ts`：`POST /me/api-keys/revoke-all` | 🟡 | 仅批量吊销全部 Key；缺勾选子集批量启停/删除 |
| 22.13 | 账号注销 | `deletion.ts`：checks/request/status/cancel（用户端） | ✅ | 路径以代码为准：`/me/deletion/*`，非旧文档 `/account/deletion-request` |

## 22.2 关键架构

- Webhook 为用户端入站事件订阅（`/me/webhooks`），与平台级出站投递（§16.1.11/§32.1）是两套方向，ADR-0027 已明确分离。
- 合规同意与数据导出当前由同一前端 `ConsentPage`（路由 `/data-export`）承载两个职责，后续应拆分为同意页与导出页两个入口。

## 22.3 未实现项

| 优先级 | 事项 |
|---|---|
| P1 | 仪表盘成本预测卡 + 异常告警卡 |
| P2 | 实时活动流前端接入、Key 操作日志、错误码自助页、批量勾选操作 |
