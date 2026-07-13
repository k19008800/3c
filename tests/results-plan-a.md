# 方案 A：API 核心链路测试 — 3cloud

**测试时间**: 2026-06-29 23:32 CST
**API**: http://localhost:3000
**DB**: PostgreSQL threecloud ✅ | **Redis**: localhost:6379 ✅

---

## 场景 1：团队管理

### 1.1 管理员创建团队 — ✅
- `POST /api/v1/team`
- Body: `{"name":"test-team-planA"}`
- 结果: 团队创建成功 (code=0)
- 注: 路由为 `/api/v1/team`（非 `/api/v1/team/create`）

### 1.2 管理员邀请用户加入团队 — ✅
- `POST /api/v1/team/invite`
- Body: `{"email":"client-ai-service@3c.local", "role":"team_member"}`
- 结果: 邀请成功 (code=0)
- 注: role 需为 `team_member`（非 `member`）

### 1.3 被邀请用户查看邀请 — ❌
- `GET /api/v1/team/invitations`
- 结果: **404 Not Found**
- 原因: 该路由未实现。`team.ts` 中无 `invitations`/`accept` 端点

### 1.4 被邀请用户接受邀请 — ❌
- `POST /api/v1/team/accept`
- 结果: **404 Not Found**
- 原因: 该路由未实现。`team.ts` 中无 `accept` 端点

### 1.5 管理员查看团队成员 — ✅
- `GET /api/v1/team`
- 结果: 成功，显示团队成员 2 人（admin + invited user）
- 注: 虽然 accept 路由不存在，但邀请后用户已自动加入团队

### 1.6 踢出成员（userId=27）— ❌
- `DELETE /api/v1/team/members/27`
- 结果: **500 Internal Server Error**
- 错误: `"Unexpected end of JSON input"` — 推测服务端请求体 JSON 解析问题

### 1.7 用户退出团队 — ⚠️
- `POST /api/v1/team/leave`
- 结果: **400** `"您不在任何团队中"`
- 说明: 用户（client-content-creator）未被邀请，因此预期无法退出

---

## 场景 2：API Key 鉴权 + 代理路由

### 2.1 用户创建 API Key — ✅
- `POST /api/v1/api-keys`
- Body: `{"name":"test-key-planA", "modelId":"*"}`
- 结果: 成功，返回 key 以 `sk-3c-` 开头
- Key: `sk-3c-71a1448a7c7b9ad533f7a551d295246b5a68d5259f25eb8dd6522d3b99992cbcbb502a9fa996d778037d149fb3aeb09e`

### 2.2 列出 API Keys — ✅
- `GET /api/v1/api-keys`
- 结果: 成功，total=3

### 2.3 用 API Key 调 OpenAI 兼容代理 — ✅
- `POST /api/v1/chat/completions`（非 `/api/v1/proxy/{model}/chat/completions`）
- Auth: `Bearer <api-key>`
- Body: `{"model":"gpt-4o","messages":[{"role":"user","content":"hello"}]}`
- 结果: **成功**，返回标准 OpenAI 格式响应
  - model: `gpt-4o`
  - 模拟回复: 150 tokens 输入，320 tokens 输出
  - 完整 chat completions 响应
- 注: 代理路由为 `/api/v1/chat/completions`，模型名放在 body 中

### 2.4 无效 API Key 测试 — ✅
- `POST /api/v1/chat/completions` with invalid API Key
- 结果: **401** `{"error":{"message":"Invalid API Key","type":"invalid_request_error","code":"invalid_api_key"}}`
- 预期行为匹配 ✅

### 2.5 删除 API Key — ❌
- `DELETE /api/v1/api-keys/{id}`
- 结果: **500 Internal Server Error**（id=30, 45, 46 均失败）
- 推测: 服务端存在 bug（可能删除时关联数据校验失败）

---

## 场景 3：模型路由

### 3.1 管理员查看厂商列表 — ✅
- `GET /api/v1/admin/vendors`
- 结果: 成功，4 个厂商：openai、anthropic、deepseek、天翼

### 3.2 查看模型列表 — ✅
- `GET /api/v1/models`
- 结果: 成功，4 个模型：gpt-4o、gpt-4o-mini、claude-3.5-sonnet、deepseek-chat

### 3.3 添加厂商模型 — ❌
- `POST /api/v1/admin/vendor-models`
- Body: 包含 vendorId=1, modelId=1, apiEndpoint, apiKey, sellPriceInput/Output
- 结果: **500 Internal Server Error** — DB insert 失败
  - 错误: `Failed query: insert into "vendor_models" ... params: 1,1,gpt-4,...,0.000000,0.000000,0.000010,0.000020,100,,`
  - 原因: `cost_price_input` 和 `cost_price_output` 未传参（默认值为空字符串 `''` 而非有效的 DECIMAL）
  - 修复: 需同时传入 `costPriceInput` 和 `costPriceOutput` 参数字段

### 3.4 不存在模型测试 — ✅
- `POST /api/v1/chat/completions` with model="nonexistent-model-v99"
- 结果: **404** `{"error":{"message":"模型 \"nonexistent-model-v99\" 不存在。可用模型请调用 GET /api/v1/models","type":"invalid_request_error","code":"MODEL_NOT_FOUND"}}`
- 预期行为匹配 ✅

---

## 场景 4：限流测试

### 4.1 高频调用测试 — ⚠️
- 连续 30 次快速调用 `GET /api/v1/models`
- 结果: **未触发 429 限流**
- 说明: 30 次调用均正常返回，未触发 rate limit。可能阈值配置较高或限流仅在代理路由上生效

---

## 场景 5：分销/代理

### 5.1 查看代理商信息 — ✅
- `GET /api/v1/agent/dashboard`（非 `/api/v1/agent/profile`）
- 结果: 成功
  - totalClients=10
  - totalCommission=130970.49
  - availableBalance=268.19
  - commissionRate=10%

### 5.2 查看绑定客户列表 — ✅
- `GET /api/v1/agent/clients`
- 结果: 成功，10 个客户，含消费汇总数据

### 5.3 查看分佣记录 — ✅
- `GET /api/v1/agent/commissions`
- 结果: 成功，10011 条记录，支持多种佣金类型（sale/renewal/team/activity）

### 5.4 申请提现 — ✅
- `POST /api/v1/agent/withdraw`
- Body: `{"amount":"500.00","bankCardNo":"6222021234567890","bankName":"Test Bank"}`
- 结果: 成功，创建提现订单 #41
  - Voucher: VCH-20260629-B-0001
  - Status: pending_first_review
  - 注: 需同时提供 bankCardNo 和 bankName（schema 必填）

### 5.5 管理员审核提现 — ❌
- `GET /api/v1/admin/withdraws` — ✅ 成功，列出 3 笔待初审提现
- `POST /api/v1/admin/withdraws/41/first-review` — ❌ **500 Internal Server Error**
  - 错误: `Failed query: insert into "audit_logs" ... operator_id = default (null)`
  - 原因: 审核流程中 audit_logs 表的 operator_id 字段从请求中获取，但 `request.user` 下的 id 字段可能未正确映射
  - 注: 提现审核端点为 `/api/v1/admin/withdraws/:id/first-review`（非 `/api/v1/admin/agents/{agentId}/review-withdraw`）

---

## 汇总

| 场景 | 步骤 | 结果 | 说明 |
|------|------|------|------|
| 团队管理 | 1.1 创建团队 | ✅ | 路由为 POST /api/v1/team |
| 团队管理 | 1.2 邀请成员 | ✅ | role 为 team_member |
| 团队管理 | 1.3 查看邀请 | ❌ | 路由未实现 |
| 团队管理 | 1.4 接受邀请 | ❌ | 路由未实现 |
| 团队管理 | 1.5 查看成员 | ✅ | 团队信息正常 |
| 团队管理 | 1.6 踢出成员 | ❌ | DELETE 500 bug |
| 团队管理 | 1.7 退出团队 | ⚠️ | 用户未在团队中 |
| API Key | 2.1 创建 Key | ✅ | 正确返回 sk-3c- 开头 Key |
| API Key | 2.2 列出 Key | ✅ | 正常 |
| API Key | 2.3 代理调用 | ✅ | OpenAI 兼容格式响应 |
| API Key | 2.4 无效 Key | ✅ | 正确返回 401 |
| API Key | 2.5 删除 Key | ❌ | DELETE 500 bug |
| 模型路由 | 3.1 厂商列表 | ✅ | 4 个厂商 |
| 模型路由 | 3.2 模型列表 | ✅ | 4 个模型 |
| 模型路由 | 3.3 添加厂商模型 | ❌ | DB insert 需传 costPriceInput/Output |
| 模型路由 | 3.4 不存在模型 | ✅ | 正确返回 404 |
| 限流 | 4.1 高频调用 | ⚠️ | 30 次未触发 429 |
| 分销 | 5.1 代理商面板 | ✅ | 仪表盘数据正常 |
| 分销 | 5.2 客户列表 | ✅ | 10 个客户 |
| 分销 | 5.3 分佣记录 | ✅ | 10011 条 |
| 分销 | 5.4 申请提现 | ✅ | 含银行卡信息 |
| 分销 | 5.5 审核提现 | ❌ | audit_logs 500 bug |

### 缺陷汇总

1. **S1-BUG-001** - `GET /api/v1/team/invitations` 和 `POST /api/v1/team/accept` 路由未实现（404）
2. **S1-BUG-002** - `DELETE /api/v1/team/members/:userId` 返回 500 (`Unexpected end of JSON input`)
3. **S2-BUG-001** - `DELETE /api/v1/api-keys/:id` 返回 500（所有受影响）
4. **S3-BUG-001** - `POST /api/v1/admin/vendor-models` 缺少 `costPriceInput`/`costPriceOutput` 参数校验，传空值导致 DB insert 失败
5. **S5-BUG-001** - `POST /api/v1/admin/withdraws/:id/first-review` 审核时 `operator_id` 为 null，audit_logs insert 失败

### API 路由差异（Spec vs Actual）

| 测试方案指定 | 实际路由 | 说明 |
|-------------|---------|------|
| POST /api/v1/team/create | POST /api/v1/team | 简化为 /team |
| POST /api/v1/team/remove-member | DELETE /api/v1/team/members/:userId | 改为 DELETE + path param |
| POST /api/v1/team/invitations | — | 未实现 |
| POST /api/v1/team/accept | — | 未实现 |
| GET /api/v1/team/members | GET /api/v1/team | 合并到团队信息中 |
| GET /api/v1/agent/profile | GET /api/v1/agent/dashboard | 路由名不同 |
| POST /api/v1/proxy/{model}/chat/completions | POST /api/v1/chat/completions | 模型在 body 中 |
| POST /api/v1/admin/agents/{agentId}/review-withdraw | POST /api/v1/admin/withdraws/:id/first-review | 结构完全不同 |

### 测试环境

- API Server: http://localhost:3000 (Fastify)
- Frontend: http://localhost:5175 (Vite)
- Testing tool: PowerShell Invoke-RestMethod
- JWT Tokens: Admin (super_admin), User (client-content-creator), Agent (13819008800@163.com)
