# API 契约对齐（前端 253 端点 ↔ 后端 v3）

> 状态：`2026-08-09` 统一单前端+单后端后，前端 131 页共调用 **253 个 API 端点**，后端当时只注册 ~18 个。
> 本文档把契约一次性拉平：**前端路径即事实标准**，后端按此实现，不再出现"同一功能两套命名"。

## 0. 契约基线

| 项 | 值 |
|----|----|
| 统一入口 | `http://localhost:5177`（web-portal → `/api/*` 代理到 3030，`/app/*` 代理到 5175） |
| API baseURL | 前端 `api` 客户端 baseURL = `/api/v1`（web-console [lib/api.ts](../web-console/src/lib/api.ts)） |
| 后端前缀 | 业务路由一律挂 `/api/v1/...`；OpenAI 兼容路由挂 `/v1/...`（无 `/api` 前缀） |
| 认证 | JWT `Authorization: Bearer <accessToken>`；OpenAI 兼容用 API Key `Bearer sk-.../3c_...` |
| 分页 | `{ data, pagination: { page, pageSize, total, totalPages } }` |
| 错误 | `{ error: { message, type, code } }` |

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
| GET | `/v1/models` | OpenAI 模型列表 | chat.ts ✅ |

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
| /me/change-password · /me/change-email | 1 | ⬜ |
| /me/invoices · /me/invoices/:id/download | 1 | ⬜ |
| /me/webhooks · /me/webhooks/:id | 3 | ⬜ |
| /me/api-keys/revoke-all | 1 | ⬜ |
| /me/notifications/:id/read · /me/notifications/read-all | 1 | ⬜ |
| /me/notification-settings/:id/email | 1 | ⬜ |
| /me/preferences/notifications · /reset | 1 | ⬜ |
| /me/devices/:id/logout | 1 | ⬜ |
| /me/real-name | 1 | ⬜ |
| /me/redemption/redeem | 1 | ⬜ |
| /me/groups/:id | 1 | ⬜ |
| /me/tickets · /reply · /resolve | 1 | ⬜ |
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
| /auth/forgot-password · /auth/reset-password | 1 | ⬜ |
| /auth/send-email-code | 1 | ⬜ |
| /auth/oauth/:id/bind · /auth/oauth/:id/unbind | 1 | ⬜ |
| /auth/2fa/setup · /auth/2fa/verify · /auth/2fa/disable | 1 | ⬜ |

### 2.3 代理商 `/agent/*`
| 端点 | 状态 |
|------|----|
| /agent/dashboard · /agent/commission · /agent/consumption · /agent/consumption/recent · /agent/customers | ⬜ |
| /agent/invite/code · /agent/invite/records · /agent/invite/code/regenerate | ⬜ |
| /agent/settlements · /:id · /:id/confirm | ⬜ |
| /agent/withdraw/balance · /agent/withdraw/records · /agent/withdraw/bank-info · /agent/withdraw/apply | ⬜ |
| /agent/ranking · /agent/reports | ⬜ |

### 2.4 管理后台 `/admin/*`（体量最大，约 170 个）
- **供应商/模型/定价**：/admin/vendors·/:id·/models·/keys、/admin/vendor-profiles、/admin/vendor-pricing·/:id·batch-adjust、/admin/vendor-models·/:id、/admin/vendor-costs·/:id、/admin/vendor-stats、/admin/vendor-performance、/admin/vendor-settlements/generate、/admin/models·/:id、/admin/models/marketplace、/admin/multimodal-models·/:id、/admin/price-changes·/:id/notify — **全部 ⬜**
- **供应商→前端 `/admin/suppliers` 后端已有，但前端页面实际调的是 `/admin/vendors`** — 需后端按 `/admin/vendors` 对齐 ✅→（迁移后）
- **财务/资金**：/admin/finance/*、/admin/settlements、/admin/reconciliation·/diffs、/admin/cost/dashboard、/admin/cost/prediction、/admin/profit、/admin/manual-topup、/admin/finance/ledger/adjust — **⬜**
- **客户/工单/客服**：/admin/customers、/admin/agents·/:id·/assign·/level、/admin/tickets/:id/status·/reply·/note·/assign、/admin/chat/sessions/:id/transfer·/close、/admin/chat/status、/admin/support/*、/admin/quick-replies、/admin/knowledge-base·/:id·/categories — **⬜**
- **运营/营销**：/admin/campaigns·/:id·/status·/grant、/admin/coupons/generate、/admin/discount-rules·/:id、/admin/affiliate/config·/records、/admin/announcements·/:id、/admin/redemption/batches·/:id/toggle — **⬜**
- **风控/安全**：/admin/risk/dashboard·/rules·/events、/admin/security/incidents·/ip-blacklist、/admin/balance-alerts·/:id/notify、/admin/balance-alert-config、/admin/audit-logs — **⬜**
- **数据/合规**：/admin/data-requests·/:id(approve|reject|export)、/admin/data-export/:id(process|reject|resend)、/admin/deletion/*、/admin/content·/:id、/admin/content-moderation/* — **⬜**
- **系统**：/admin/settings·/:id/versions、/admin/sys/cache·/logs·/db·/version·/migrations、/admin/i18n/entries、/admin/undo/records·/:id/execute、/admin/email-templates、/admin/subscription/plans·/subscribers、/admin/tax-banking/config·/history·/bank-accounts、/admin/notification-policies·/:id、/admin/webhooks·/:id·/logs·/test、/admin/webhook-retry·/:id、/admin/roles — **⬜**
- **看板/洞察**：/admin/dashboard、/admin/cockpit（前端页面在但调用集中在以上端点）、/admin/consumption/anomalies·/stream·/tracking、/admin/commission/flow、/admin/competitive/monitor、/admin/conversion/funnel、/admin/operation/diff、/admin/operator/dashboard、/admin/performance、/admin/price-changes — **⬜**
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

其余 23 张表（agent_*, risk_*, tickets, coupons, invoices…）已有 schema，等待对应端点实现。

---

## 4. 已知前端契约问题（已修 / 待修）

| # | 问题 | 处理 |
|---|------|------|
| 1 | Playground 把 `keyPrefix`（12位）当 Bearer 发 → 永远 401 | 已修：改为发送完整 Key（创建时仅展示一次，存入 localStorage 供 Playground 预填） |
| 2 | Playground URL 为 `/api/v1/v1/chat/completions`（双 v1，历史笔误） | 保留：后端注册 `/api/v1/v1/chat/completions` 别名，与 OpenAI 兼容 `/v1/chat/completions` 并存 |
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
