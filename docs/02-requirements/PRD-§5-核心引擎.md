# §5 核心引擎（网关 / 计费 / 路由 / 限流） — 浩寅云

> 代码基线：91f62d3 + Step4 | 重写日期：2026-10-03
> 权威源：`services/pipeline/executor.ts` Saga 补偿执行 + `services/upstream/*`。

## 网关主链路（实际实现）

chat / messages / responses / rerank 共用 8 步链路（见 `routes/chat.ts` 头注 + `services/pipeline/executor.ts`）：

```
auth(preHandler apiKeyAuth) → idempotency → rate-limit → validate
→ budget-check(Step4) → pre-consume(Redis Lua 冻结) → route(selectChannel)
→ proxy(Step4 故障转移循环) → settle(多退少补)
```

任一步失败由 executor 反向 rollback（解冻/释放幂等锁）。

## 功能清单

### 5.1 智能路由与通道选择

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 5.1.1 | API Key 鉴权（存在/启用/过期） | `services/auth/apikey.ts` | ✅已实现 | preHandler 强制执行；bcrypt hash |
| 5.1.2 | IP 黑名单网关拦截 | `app.ts` onRequest hook + `services/security/ip-blacklist.ts` | ✅已实现 | api/admin 双 scope，命中 403 |
| 5.1.3 | **Key 细粒度权限拦截（Step4）** | `services/security/key-permissions.ts` `enforceKeyPermissionsPreHandler` | ✅已实现 | 模型黑白名单/IP/Referer，详见 §2.3.3 |
| 5.1.4 | 模型编码解析与校验 | `services/upstream/routing.ts` `assertModelCodeAvailable`/`validateModelCode` | ✅已实现 | 不存在/含@→404，分组排除→403 |
| 5.1.5 | 分组供给过滤（allowedGroups） | `routing.ts` `channelServesGroups`/`selectChannel` | ✅已实现 | 用户分组→可见模型过滤 |
| 5.1.6 | 渠道选择按 priority 排序 | `routing.ts` orderBy desc priority | ✅已实现 | 仅按 priority |
| 5.1.7 | **请求级故障转移（Step4 新增）** | `services/pipeline/steps/proxy.ts` | ✅已实现 | 见下 |
| 5.1.8 | 熔断器三态状态机 | `services/upstream/circuit-breaker.ts` | 🟡部分实现 | 状态机 active/open/half_open 正确；参数见 5.1.9 |
| 5.1.9 | 熔断参数与落表 | `circuit-breaker.ts:27-30` | 🟡部分实现 | **代码实际：窗口 5min、冷却 60s、半开放行 1 个试探，状态存 `circuit_breaker_state` 表**（旧 SPEC 写 1min/30s/3 探/记 security_events，以代码为准） |
| 5.1.10 | 幂等（Idempotency-Key） | `services/idempotency.ts` + pipeline step | ✅已实现 | 冲突回放首次结果，失败释放锁 |
| 5.1.11 | 多协议适配 | `anthropic.ts`/`messages.ts`(claude-adapter)/`responses.ts`(responses-adapter)/`rerank.ts`/`task-relay.ts` | ✅已实现 | OpenAI/Anthropic/Responses/Cohere/MJ/Suno 6 类 |
| 5.1.12 | 多模态预处理落盘 + 内网拉取 | `upstream/body-preprocessor.ts`、`temp-asset-store.ts`、`internal-assets.ts` | ✅已实现 | >1MB base64 落临时盘，`/internal/assets/:name` 防路径穿越 |
| 5.1.13 | WebSocket 流式网关 | `routes/ws.ts` + `upstream/ws-relay.ts` | ✅已实现 | ?api_key= 鉴权，方案 A/B + 结算 |
| 5.1.14 | MJ/Suno 任务落库 + 轮询 + 失败退款 | `task-relay.ts` + `services/task/task-poller.ts` | ✅已实现 | 1 任务≡1000 output token 固定价，超时自动退款冲销佣金 |

**5.1.7 故障转移明细（Step4）**：
- `MAX_FAILOVER_RETRIES = 2`：初始 key 之外最多再回退 2 个候选 key（共至多 3 次尝试）。
- 触发：网络错误（fetch 异常）**或**上游返回 retryable（5xx / 429）。
- 每次 `advanceFailover(ctx, triedKeyIds, attempt)` 选下一个未尝试的候选 key；全部候选用尽才抛 `UpstreamPassthroughError`。
- 成功/失败经 `recordChannelResult` 喂给熔断器。

### 5.2 计费与结算

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 5.2.1 | 分层定价 L5活动→L4分组→L3代理→L2模型覆盖→L1兜底 | `services/billing/pricing.ts` | ✅已实现 | 5 级优先级 |
| 5.2.2 | 预扣→多退少补 | `billing/pre-consume.ts` + `settle.ts` | ✅已实现 | Redis 冻结 + PG 镜像，失败 rollback |
| 5.2.3 | 缓存命中折扣计费 | `billing/cache-billing.ts` + `usage-parser.ts` | ✅已实现 | 模型级/全局/兜底三级折扣；DeepSeek/Anthropic/OpenAI 三字段归一化；流式亦解析 cacheHitTokens |
| 5.2.4 | 代理等级折扣价（L3） | `pricing.ts` `AGENT_LEVEL_DISCOUNT_RATE` | ✅已实现 | |
| 5.2.5 | 活动价（L5） | `pricing.ts` `parseCampaignPricing`/`queryCampaignPricing` | ✅已实现 | |
| 5.2.6 | 任务型 API 固定单价 | `task-relay.ts` | ✅已实现 | MJ/Suno 按 action 映射模型名取价 |
| 5.2.7 | **用户预算熔断（Step4）** | `services/billing/budget.ts` `assertWithinBudget` + pipeline `budgetCheckStep` | ✅已实现 | pre-consume 前判定，超限 hardBlock→429；详见 §2.5 |
| 5.2.8 | **平台总账 platform_ledger（Step4）** | `services/finance/platform-ledger.ts` | ✅已实现 | 充值/消费/退款双分录写入 + 会计恒等式校验，详见 §4.4.2 |

### 5.3 限流引擎

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 5.3.1 | L1 全局限流 | `app.ts` @fastify/rate-limit max=600/min | 🟡部分实现 | 代码 600/min 兜底（非旧 SPEC 万级 QPS 硬顶） |
| 5.3.2 | L2 用户级 QPS/TPM | `services/rate-limit/enforcer.ts` user_groups | ✅已实现 | 按 userId |
| 5.3.3 | L4 模型硬顶 | `enforcer.ts` model_rate_limits cap_rpm/cap_tpm | ✅已实现 | 按 userId+model |
| 5.3.4 | 客户例外规则 | `enforcer.ts` quota_exception_rules | ✅已实现 | 生效值=min(例外??组默认??平台默认, 模型硬顶) |
| 5.3.5 | Redis 固定窗口 + fail-open 降级 | `enforcer.ts` | ✅已实现 | Redis 故障静默放行 |
| 5.3.6 | **Key 级 RPM/TPM/日 Token（Step4）** | `api_keys.rpm_limit/tpm_limit/daily_token_limit` + key-permissions | ✅已实现 | NULL=不限 |

### 5.4 健康度与告警

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 5.4.1 | 模型健康度聚合（p50/p99 直方图） | `services/marketplace/model-health-aggregator` + `/public/models/health` | ✅已实现 | 用于 Marketplace 展示，非告警 |
| 5.4.2 | 站内通知 / 邮件 / WS 推送通道 | `services/notify.ts`、`mailer.ts`、`ws.ts` | ✅已实现 | 基础设施在 |
| 5.4.3 | 用户余额告警 | `admin-consumption.ts` `/admin/balance-alerts*` | 🟡部分实现 | 用户级催缴，非平台运维告警 |
| 5.4.4 | 平台运维告警检测引擎 | `services/monitoring/alert-engine.ts` + `/admin/alerts*` | ✅已实现 | 7 项指标（error_rate/qps/response_latency/cost_spike/balance_low/vendor_health/cache_hit_rate）；每 60s tick；状态机 firing→acknowledged→resolved。**注**：原长期报 `monitoring_rules 不存在`，因手工迁移器漏挂 0048，已修 |
| 5.4.5 | 告警规则后台配置 | `web-console/src/pages/AdminAlertCenterPage.tsx` `/app/admin/alerts` | ✅已实现 | 事件/规则双Tab；规则 CRUD + 启停；告警确认；写操作限 super_admin（后端 `superAdminOnly` 兜底） |

## 关键架构说明

- **Saga 补偿**：executor 按序执行 step，任一抛错即反向回滚已完成 step（解冻 Redis 预扣、释放幂等锁）。
- **预扣口径**：余额>阈值时旁路预扣；Redis Lua 原子冻结 + PG 镜像，settle 时多退少补。
- **熔断与故障转移关系**：熔断器达阈值后把 key 标 open 直接跳过；故障转移处理的是「未达熔断阈值但瞬时 5xx/429」的抖动场景，两者互补。

## 未实现 / 规划中

| 功能点 | 状态 | 说明 |
|---|---|---|
| 权重轮询 / 最少连接 / 最低延迟 / 成本优先 | ❌未实现（规划中） | supplier_keys.selectMode 被查出但未消费；仅 priority 排序 |
| 手动强制指定渠道（force_channel） | ❌未实现（规划中） | 无路由覆盖 |
| 路由推荐（基于历史价格/延迟/成功率） | ❌未实现（规划中） | |
| 决策树可视化后台 | ❌未实现（规划中） | 无链路决策数据接口 |
| ~~7 项平台运维告警检测引擎（失败率/可用率/P95/余额/磁盘/CPU…）~~ | ✅已实现（见 5.4.4） | 原状态"未实现"已过期：表由0048 落地、引擎已接；另修复了迁移器漏挂 0048 导致引擎从未真正启动的问题 |
| ~~告警规则后台配置~~ | ✅已实现（见 5.4.5） | 原状态"未实现"已过期：`/app/admin/alerts` 告警中心页已交付 |
| 告警历史趋势看板（时间序列图） | ❌未实现（规划中） | 当前仅列表+分页，无图表 |
| 智能定价建议 | ❌未实现（规划中） | |
| 限流可视化看板（命中率 Top） | ❌未实现（规划中） | |
