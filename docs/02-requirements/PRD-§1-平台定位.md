# §1 平台定位与运营模型 — 浩寅云

> 代码基线：91f62d3 + Step4（工作区未提交改动） | 重写日期：2026-10-03
> 本文档基于代码现状反向编写，不是按旧期望。品牌统一为「浩寅云」。

## 平台定位

浩寅云是一个 **LLM 模型算力中转与分销平台**：向上聚合多家上游供应商（vendor）的模型 API，向下以统一网关把 OpenAI / Anthropic / Cohere 等协议的推理能力转售给终端用户，并通过代理商体系完成渠道分销与佣金结算。

核心商业模型（见 `web-portal/src/app/about/page.tsx`）：
**采购上游算力 → 统一网关聚合 → 分层定价转售 → 代理商分销计佣**。

## 功能清单

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 1.1 | 商业模型对外表达（采购→转售→代理佣金） | web-portal `app/about/page.tsx` | ✅已实现 | 关于页完整描述模型与里程碑 |
| 1.2 | 运营总览看板（聚合 KPI） | `routes/admin-dashboard.ts` GET `/admin/dashboard` | ✅已实现 | 卡片聚合 + 待办 widget |
| 1.3 | 运营分析看板（漏斗/成本/运营/客户成功） | `routes/admin-analytics.ts` | ✅已实现 | conversion/funnel、cost/dashboard、cost/prediction、operator/dashboard、customer-success 五端点 |
| 1.4 | 用户分层 | `routes/admin-customers.ts` | 🟡部分实现 | 用户列表/筛选/消费画像在；5 层显式分层标签逻辑未独立落地 |
| 1.5 | 平台公开统计（模型数/供应商/用户/累计 Token） | `routes/suppliers.ts` GET `/api/v1/public/stats` | ✅已实现 | 首页 StatsBanner 数据源 |
| 1.6 | 供应商聚合（vendor 多上游） | `routes/suppliers.ts`、`admin-vendor-alias.ts` | ✅已实现 | 供应商档案/模型映射/Key/余额/性能全链 |
| 1.7 | 统一多协议网关（OpenAI/Anthropic/Responses/Cohere/MJ/Suno） | `routes/chat.ts`、`anthropic.ts`、`messages.ts`、`responses.ts`、`rerank.ts`、`task-relay.ts` | ✅已实现 | 6 类协议端点全覆盖，详见 §5 |
| 1.8 | 分层定价转售（L1 兜底→L5 活动） | `services/billing/pricing.ts` | ✅已实现 | 5 级优先级匹配，详见 §5.2 |
| 1.9 | 代理商分销与单级佣金 | `services/agent/commission.ts` | ✅已实现 | junior/senior/partner 三级、单级计佣，详见 §3 |
| 1.10 | 品牌站点配置（12 个 site_* 白名单） | `routes/public.ts` GET `/public/site-config` | ✅已实现 | 品牌文案/Logo/域名由后台配置 |

## 关键架构说明（实际实现）

- **双前端 + 单 API**：`web-portal`（Next.js 15 SSR，对外营销站）与 `web-console`（Vite，登录后控制台/管理后台）共用同一 Fastify API（`api/src/app.ts`）。Portal 通过 next.config redirect 把 `/login`、`/register`、`/dashboard` 收敛到 `/app/*`（web-console 产物）。
- **无统一路由前缀**：网关推理端点挂在根路径（`/v1/chat/completions`、`/anthropic/v1/messages`），业务端点挂 `/api/v1/*`。
- **供应商→模型→渠道 Key 三层**：一个逻辑模型（model）可映射多个供应商（suppliers），每个供应商配多个渠道 Key（supplier_keys）；网关按 priority 选 Key，Step4 起支持请求级故障转移（详见 §5）。
- **公开数据出口**：所有对外营销页数据来自 `/api/v1/public/*` 免鉴权端点（site-config/api-config/models/pricing/stats/status/blog/i18n）。

## 未实现 / 规划中

| 功能点 | 状态 | 说明 |
|---|---|---|
| 用户 5 层显式分层标签与分层运营动作 | ❌未实现（规划中） | 现有用户列表/消费画像，缺分层自动打标与分层推送闭环 |
| 公开产品路线图页（/roadmap） | ❌未实现（规划中） | 内部排期文档，当前无公开页（合理，非缺口） |
| A/B 实验平台 | ❌未实现（规划中） | 分析看板有漏斗/成本，无 AB 实验配置与分流 |
