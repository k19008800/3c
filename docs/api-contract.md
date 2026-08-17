# API 契约对齐（前端 253 端点 ↔ 后端 v3）

> 状态：`2026-08-09` 统一单前端+单后端后，前端 131 页共调用 **253 个 API 端点**，后端当时只注册 ~18 个。
> `2026-08-14` 补「消费运营」整块后端接口（tracking/stream/anomaly/balance-alert），见 §2.4 消费运营行。
> 本文档把契约一次性拉平：**前端路径即事实标准**，后端按此实现，不再出现"同一功能两套命名"。

## 0. 契约基线

| 项 | 值 |
|----|----|
| 统一入口（本地） | `http://localhost:5177`（web-portal → `/api/*`、`/v1/*`、`/anthropic/*` 代理到 3000，`/app/*` 静态托管 web-console） |
| 对外 API 域名（生产） | `https://api.<host>`（独立 vhost，见 `deploy/api.unmisa.com.conf`） |
| OpenAI 兼容 base_url | `https://api.<host>/v1`（`POST /v1/chat/completions`；OpenAI SDK base_url 语义含 `/v1`） |
| Anthropic 兼容 base_url | `https://api.<host>/anthropic`（`POST /anthropic/v1/messages`，Anthropic SDK 自动拼 `/v1/messages`） |
| **API 域名配置** | **后台可设置**：系统设置 → API 服务（`system_config.api_domain`，PUT `/admin/settings/api`）；门户/控制台经 `GET /public/api-config` 读取派生地址 |
| API baseURL（前端） | 前端 `api` 客户端 baseURL = `/api/v1`（web-console [lib/api.ts](../web-console/src/lib/api.ts)） |
| 后端前缀 | 业务路由一律挂 `/api/v1/...`；OpenAI 兼容路由挂 `/v1/...`（无 `/api` 前缀）；Anthropic 兼容挂 `/anthropic/...` |
| 认证 | JWT `Authorization: Bearer <accessToken>`；OpenAI 兼容用 API Key `Bearer 3c_...`；Anthropic 兼容用 `x-api-key: 3c_...`（也接受 Bearer） |
| 分页 | `{ data, pagination: { page, pageSize, total, totalPages } }` |
| 错误 | 业务 `{ error: { message, type, code } }`；Anthropic 兼容 `{ type: "error", error: { type, message } }` |

**对齐原则**：前端先写页面 → 页面定了调用路径与响应形状 → 后端必须照做。若后端路由与前端不符，改**后端**，不改前端（今天的前端是成果）。

---

## 1. MVP 切片（本次已实现 ✅）— 跑通"可用"链路

链路：**注册 → 登录 → 创建/管理 API Key → 调 `/v1/chat/completions` 出模型 → 消费记账 + 余额扣减 → 页面看到余额/消费/日志**

| 方法 | 路径（前端实际调用） | 响应形状（前端期望） | 后端模块 |
|------|------|------|------|
| POST | `/auth/register` | `{ user, accessToken, refreshToken }` | auth.ts ✅ |
| POST | `/auth/login` | `{ user, accessToken, refreshToken }` | auth.ts ✅ |
| POST | `/auth/logout` | `{ message }` | auth.ts ✅ |
| POST | `/auth/refresh` | `{ accessToken, refreshToken }` | auth.ts ✅ |
| GET | `/me` | 直接返回 user 对象 `{ id,email,username,name,role,status,balance,realNameStatus }` | me.ts ✅ |
| GET | `/me/api-keys` | `{ list: [{ id,name,keyPrefix,status,mode,expiresAt,lastUsedAt,todayCalls,createdAt }] }` | apikeys.ts ✅ |
| POST | `/me/api-keys` | `{ key: "<rawKey 仅显示一次>", warning }` | apikeys.ts ✅ |
| PATCH | `/me/api-keys/:id` | body `{ status }` | apikeys.ts ✅ |
| DELETE | `/me/api-keys/:id` | `{ message }` | apikeys.ts ✅ |
| GET | `/me/keys` | `ApiKey[]` 数组（Playground 用） | me.ts ✅ |
| GET | `/me/models` | `[{ id,name,provider,inputPrice,outputPrice }]`（Playground 用） | me.ts ✅ |
| GET | `/me/stats` | `{ balance,monthlyCost,todayCalls,activeKeys,totalKeys,todayCallCount,todayTokenUsage,todayCost,estimatedDays }` | me.ts ✅ |
| GET | `/me/logs` | `{ list: [{ id,provider,upstream_model,request_tokens,response_tokens,total_tokens,cost,status,error_code,latency_ms,created_at }] }` | me.ts ✅ |
| GET | `/me/billing/current` | `{ data: { period,total_cost,bill_count,days_left,next_billing_date } }` | me.ts ✅ |
| GET | `/me/billing/history` | `{ data: { list: [{ month,total_cost,bill_count }] } }` | me.ts ✅ |
| GET | `/me/billing/current/daily` | `{ data: { list: [{ day,cost }] } }` | me.ts ✅ |
| GET | `/me/billing/history/:month` | `{ data: MonthDetail }` | me.ts ✅ |
| GET | `/me/billing/history/:month/download` | CSV blob | me.ts ✅ |
| POST | `/v1/chat/completions` | OpenAI 兼容（stream/非 stream），**有 mock 回退** | chat.ts ✅ |
| POST | `/api/v1/v1/chat/completions` | 同上（web-console 内部路径别名） | chat.ts ✅ |
| POST | `/v1/rerank` | Cohere 兼容重排序（`{ model, query, documents, top_n?, return_documents? }`），**有 mock 回退** | rerank.ts ✅ |
| POST | `/api/v1/v1/rerank` | 同上（web-console Playground 内部路径别名，2026-08-17） | rerank.ts ✅ |
| POST | `/v1/responses` | OpenAI Responses API 兼容（非流式 + 流式 SSE 事件序列），**有 mock 回退** | responses.ts ✅ |
| POST | `/api/v1/v1/responses` | 同上（web-console Playground 内部路径别名，2026-08-17） | responses.ts ✅ |
| POST | `/v1/embeddings` | OpenAI 兼容向量化（string / string[] input），**有 mock 回退** | openai-compat.ts ✅ |
| POST | `/api/v1/v1/embeddings` | 同上（web-console Playground 内部路径别名，2026-08-17） | openai-compat.ts ✅ |
| POST | `/v1/completions` | OpenAI 兼容文本补全（prompt 字段，stream/非 stream），**有 mock 回退** | openai-compat.ts ✅ |
| POST | `/api/v1/v1/completions` | 同上（web-console Playground 内部路径别名，2026-08-17） | openai-compat.ts ✅ |
| POST | `/v1/messages` | Anthropic Messages API 兼容（stream/非 stream，Bearer 或 x-api-key），**有 mock 回退** | messages.ts ✅ |
| POST | `/api/v1/v1/messages` | 同上（web-console Playground 内部路径别名，2026-08-17） | messages.ts ✅ |
| GET | `/v1/models` | OpenAI 模型列表 | chat.ts ✅ |
| POST | `/anthropic/v1/messages` | **Anthropic Messages API 兼容**（stream/非 stream，x-api-key 鉴权），**有 mock 回退** | anthropic.ts ✅ |
| GET | `/anthropic/v1/models` | Anthropic 模型列表（`{ data: [{ type, id, display_name }] }`） | anthropic.ts ✅ |

**SDK 接入（对齐 DeepSeek 用法）**
```python
# OpenAI SDK
client = OpenAI(base_url="https://api.<host>/v1", api_key="3c_xxx")
# Anthropic SDK
client = Anthropic(base_url="https://api.<host>/anthropic", api_key="3c_xxx")
# 本地开发：把 https://api.<host> 换成 http://localhost:5177（统一入口）或 http://localhost:3000（后端直连）
```

**MVP 业务规则**
- 注册自动建余额账户并赠送 `¥10.00` 体验金（无充值渠道下让"余额扣减"可演示）。
- `/v1/chat/completions` 校验余额：不足 → `402 Insufficient Balance`，不调上游。
- 成功后：`deductBalance`（乐观锁）+ `recordConsumption` + 更新 key 的 `last_used_at`。
- 上游不可用（无供应商 key / 熔断 / 网络失败）→ **mock 回退**：返回模拟 completion，同样记账扣费，保证链路可演示。
- 计费单价：优先取 `vendor_pricing` 该模型的定价；取不到用默认价（输入 ¥0.002/1K，输出 ¥0.008/1K）。

---

## 2. 全量端点地图（253）

> 标注：✅=已实现 · ⬜=待实现 · 数字=前端调用次数。分组按前端页面语义，不是后端文件。

### 2.1 用户端 `/me/*`（本人视角）
| 端点 | 次 | 状态 |
|------|----|----|
| /me/api-keys (+POST/PATCH/DELETE) | 3 | ✅ |
| /me/keys | 1 | ✅ |
| /me/models | 1 | ✅ |
| /me/stats | 1 | ✅ |
| /me/logs | 1 | ✅ |
| /me/billing/current · history · current/daily · history/:month · download | 1 | ✅ |
| /me/change-password · /me/change-email | 1 | ✅ |
| /me/invoices · /me/invoices/:id/download | 1 | ✅ |
| /me/webhooks · /me/webhooks/:id (+regenerate-secret · /test) | 3 | ✅ |
| /me/api-keys/revoke-all | 1 | ✅ |
| /me/notifications/:id/read · /me/notifications/read-all | 1 | ⬜ |
| /me/notification-settings/:id/email | 1 | ⬜ |
| /me/preferences/notifications · /reset | 1 | ⬜ |
| /me/devices/:id/logout | 1 | ⬜ |
| /me/real-name | 1 | ✅ |
| /me/redemption/redeem | 1 | ✅ |
| /me/groups/:id | 1 | ⬜ |
| /me/tickets · /reply · /resolve | 1 | ✅ |
| /me/knowledge-base/categories · /me/knowledge-base/:id/feedback | 1 | ⬜ |
| /me/announcements/:id/read · /me/announcements/read-all | 1 | ⬜ |
| /me/deletion/checks · /status · /request · /cancel | 1 | ⬜ |
| /me/data-export/request | 1 | ⬜ |
| /me/follow-reminders · /:id/complete · /:id/ignore | 2 | ⬜ |
| /me/customer-tags · /me/customers · /:id(/contacts|/status|/tags|/consumption|/recharges|/assign) | 1 | ⬜ |
| /me/sales-performance | 1 | ⬜ |
| /me/agent/withdraw · /me/agent/notif-prefs | 1 | ⬜ |

### 2.2 认证 `/auth/*`
| 端点 | 次 | 状态 |
|------|----|----|
| /auth/login · /auth/register | 1 | ✅ |
| /auth/logout · /auth/refresh | 1 | ✅ |
| /auth/forgot-password · /auth/reset-password | 1 | ✅ |
| /auth/send-email-code | 1 | ✅ |
| /auth/oauth/:id/bind · /auth/oauth/:id/unbind | 1 | ⬜ |
| /auth/2fa/setup · /auth/2fa/verify · /auth/2fa/disable | 1 | ⬜ |

### 2.3 代理商 `/agent/*`
| 端点 | 状态 |
|------|----|
| /agent/dashboard · /agent/commission · /agent/consumption · /agent/consumption/recent · /agent/customers | ⬜ |
| /agent/invite/code · /agent/invite/records · /agent/invite/code/regenerate | ✅ |
| /agent/settlements · /:id · /:id/confirm | ✅ |
| /agent/withdraw/balance · /agent/withdraw/records · /agent/withdraw/bank-info · /agent/withdraw/apply | ✅ |
| /agent/ranking · /agent/reports | ✅（ranking 已实现，reports 待定） |

### 2.4 管理后台 `/admin/*`（体量最大，约 170 个）
- **供应商/模型/定价**：/admin/vendors·/:id·/models·/keys、/admin/vendor-profiles、/admin/vendor-pricing·/:id·batch-adjust、/admin/vendor-models·/:id、/admin/vendor-costs·/:id、/admin/vendor-stats、/admin/vendor-performance、/admin/models·/:id、/admin/models/marketplace、/admin/multimodal-models·/:id、/admin/price-changes·/:id/notify — **⬜**（/admin/pricing 定价 CRUD ✅ 已实现；/admin/vendor-settlements/generate ✅ 已实现，见下方结算行）
- **供应商→前端 `/admin/suppliers` 后端已有，但前端页面实际调的是 `/admin/vendors`** — 需后端按 `/admin/vendors` 对齐 ✅→（迁移后）
- **财务/资金**：/admin/finance/*、/admin/settlements、/admin/reconciliation·/diffs、/admin/cost/dashboard、/admin/cost/prediction、/admin/profit、/admin/manual-topup、/admin/finance/ledger/adjust — **⬜**（/admin/vendor-settlements/* + /admin/supplier-bill-match ✅ 已实现，见下方结算行）
- **客户/工单/客服**：/admin/customers、/admin/agents·/:id·/assign·/level、/admin/tickets/:id/status·/reply·/note·/assign、/admin/chat/sessions/:id/transfer·/close、/admin/chat/status、/admin/support/*、/admin/quick-replies、/admin/knowledge-base·/:id·/categories — **⬜**
- **运营/营销**：/admin/campaigns·/:id·/status·/grant、/admin/coupons/generate、/admin/discount-rules·/:id、/admin/affiliate/config·/records、/admin/announcements·/:id、/admin/redemption/batches·/:id/toggle — **⬜**
- **风控/安全**：/admin/risk/dashboard·/rules·/events、/admin/security/incidents·/ip-blacklist、/admin/audit-logs — **⬜**（/admin/balance-alerts 已实现，见下方消费运营行）
- **对话留痕（审计合规）**：/admin/conversation-records、/admin/conversation-records/:requestId、/admin/conversation-records/export、/admin/conversation-records/retention(GET/PUT)、/admin/conversation-records/retention/run — **✅ 全部已实现**（后端 `admin-conversation-records.ts`，前端页面 `admin/audit/conversation-records`）
- **消费运营（消费明细/实时流水/异常/余额预警）**：/admin/consumption/tracking、/admin/consumption/stream、/admin/consumption/anomalies、/admin/consumption/anomalies/:id/:op(resolve|ignore)、/admin/balance-alerts、/admin/balance-alerts/:userId/notify、/admin/balance-alert-config(GET/PUT) — **✅ 全部已实现**（后端 `admin-consumption.ts`，前端页面 `admin/consumption/tracking·stream·anomaly·balance-alert`；异常检测即时扫描 `services/consumption/anomaly.ts`，阈值代码常量）
- **数据/合规**：/admin/content·/:id — **✅ 已实现**（后端 `admin-ops.ts`，前端 `admin/config/content`）；/admin/data-requests·/:id(approve|reject|export)、/admin/data-export/:id(process|reject|resend)、/admin/deletion/*、/admin/content-moderation/* — **⬜**
- **系统·已实现**：/admin/sys/logs·/logs/read、/admin/sys/version·/migrations、/admin/undo/records·/:id/execute(+config GET/PUT)、/admin/webhook-retry·/:id — **✅**（后端 `admin-ops.ts`，前端 `admin/config/logs·maintenance·undo·webhook-retry`）；/admin/email-templates(+/:name CRUD·/test)、/admin/email-logs — **✅ 已实现**（后端 `admin-email.ts`）
- **系统·待实现**：/admin/sys/cache·/db、/admin/settings·/:id/versions、/admin/i18n/entries、/admin/subscription/plans·/subscribers、/admin/tax-banking/config·/history·/bank-accounts、/admin/notification-policies·/:id、/admin/webhooks·/:id·/logs·/test、/admin/roles — **⬜**
- **看板/洞察**：/admin/performance — **✅ 已实现**（后端 `admin-ops.ts`，前端 `admin/config/performance`）；/admin/dashboard、/admin/cockpit（前端页面在但调用集中在以上端点）、/admin/commission/flow、/admin/competitive/monitor、/admin/conversion/funnel、/admin/operation/diff、/admin/operator/dashboard、/admin/price-changes — **⬜**（/admin/consumption/* 已实现，见上方消费运营行）
- **供应商结算（P1-3）**：/admin/vendor-settlements/generate、/admin/vendor-settlements、/admin/vendor-settlements/:id、/admin/vendor-settlements/:id/download、/admin/vendor-settlements/:id/confirm、/admin/supplier-bill-match — **✅ 全部已实现**（后端 `admin-vendor-settlements.ts` + `services/finance/vendor-settlement.ts`，新表 vendor_settlements/vendor_settlement_items）
- **公开**：/public/pricing ✅（后端已有）、/public/status · /public/stats ⬜、/health ✅

---

## 3. 数据表映射（MVP 用到的 6 张表 + 依赖）

| 前端契约 | 表 | 字段 |
|---------|----|----|
| 登录/注册/me | `users` | id,email,password_hash,name,role,status,last_login_at |
| 余额 | `customer_balances` | user_id,total_balance,available_balance,frozen_balance,version |
| 余额流水 | `balance_transactions` | user_id,type(consumption/recharge),amount,balance_after,reference_id |
| API Key | `api_keys` | user_id,key_hash,key_prefix,name,status,last_used_at,expires_at |
| 消费记录 | `consumption_records` | user_id,api_key_id,request_id,model,input/output/total_tokens,cost,status 派生 |
| 模型/定价 | `supplier_models` + `vendor_pricing` + `suppliers` + `supplier_keys` | 供应商路由链 |
| 对话留痕（新） | `conversation_context_records` | request_id,user_id,client_key_hash,requested_model,routed_model,supplier_id,supplier_key_fp,messages(jsonb),response_text,status,tokens,cost,occurred_at（保留策略存 `system_config` conv_retention） |
| 消费异常（新） | `consumption_anomalies` | user_id,anomaly_type,amount,severity,status(pending/resolved/ignored),period_key,detail(jsonb)，unique(user_id,anomaly_type,period_key) |

其余 23 张表（agent_*, risk_*, tickets, coupons, invoices…）已有 schema，等待对应端点实现。

---

## 4. 已知前端契约问题（已修 / 待修）

| # | 问题 | 处理 |
|---|------|------|
| 1 | Playground 把 `keyPrefix`（12位）当 Bearer 发 → 永远 401 | 已修：改为发送完整 Key（创建时仅展示一次，存入 localStorage 供 Playground 预填） |
| 2 | Playground URL 为 `/api/v1/v1/chat/completions`（双 v1，历史笔误） | 保留：后端注册 `/api/v1/v1/chat/completions` 别名，与 OpenAI 兼容 `/v1/chat/completions` 并存；2026-08-17 Playground 多端点化后，rerank/responses/embeddings/completions/messages 同步注册 `/api/v1/v1/*` 别名（同一 handler 双注册，无逻辑差异） |
| 3 | auth store 调 `/me`，后端只有 `/auth/me` | 已修：新增 `/me`，按 store 期望直接返回 user 对象 |
| 4 | `/me/api-keys` 期望 `{list}` 与 `{key: rawString}`，旧后端是 `/customers/me/keys` `{keys}`/`{key:{}}` | 已修：重写为前端形状，旧路径保留为别名 |
| 5 | Dashboard 三个面板用 mock 数据（/me/stats/trend、/model-distribution、/recent-calls） | 保留 mock 展示，`/me/stats` 已给真实汇总；细分接口列为后续切片 |

---

## 5. 后续切片建议（按依赖顺序）

1. **交易切片**：充值（/me/recharge·订单+模拟支付回调）→ 发票 → 优惠券兑换 → 完整账单。
2. **供应商管理切片**：/admin/vendors CRUD + 模型 + Key + 定价（后端已有 `/admin/suppliers` 骨架，迁移命名）。
3. **工单/通知切片**：/me/tickets + /admin/tickets + 站内通知 + email 模板。
4. **代理商切片**：/agent/* + 佣金结算 + 提现。
5. **风控/系统切片**：risk、audit、settings、sys。
6. **安全切片**：2FA、OAuth、找回密码、设备管理。

> 全量端点实现前，**任一切片都应先看本节契约**——前端页面已定型，后端按路径照做即可，避免再次出现 `/suppliers` vs `/vendors` 式分叉。
