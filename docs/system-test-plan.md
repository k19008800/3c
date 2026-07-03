# 3cloud (3C) 全链路系统测试方案

> 模拟跑 1 小时（= 真实业务 1 天）
> 环境：本机开发（localhost:3000 + PostgreSQL + Memurai Redis）
> 目标：覆盖用户全生命周期 + API 调度 + 安全风控 + 财务结算

---

## 一、测试总览

| 维度 | 覆盖模块 | 测试场景数 | 预计耗时 |
|------|----------|-----------|----------|
| 1️⃣ 注册 & 认证 | auth.ts, auth-service.ts, email-service | 5 场景 | ~5min |
| 2️⃣ 实名 & 风控 | real-name-service, auth-security, geo-check, login-security, security-event | 5 场景 | ~8min |
| 3️⃣ API 调度 & 路由 | proxy.ts, router.ts, health-check, circuit-breaker, rate-limit | 8 场景 | ~15min |
| 4️⃣ Key 管理 & 计费 | api-keys.ts, billing.ts | 4 场景 | ~6min |
| 5️⃣ 充值 & 支付 | recharge.ts, payment-adapter, payment-security | 4 场景 | ~6min |
| 6️⃣ 团队 & 代理商 | team.ts, agent.ts, agent-service | 4 场景 | ~6min |
| 7️⃣ 管理后台 | admin/* (users, vendors, finance, system, security) | 6 场景 | ~8min |
| 8️⃣ 费用结算 | settleCommissions, billing settlement, withdraw | 3 场景 | ~6min |

---

## 二、前置准备（测试用种子数据）

### 2.1 已有数据（不需要动）

- 超级管理员：`admin@3cloud.dev / admin123`
- PostgreSQL 19 张表已迁移
- 厂商、模型、厂商模型已配置（vendor_models 含多条定价路由）

### 2.2 需要补充的测试固定数据

```sql
-- 管理员补充一个审核管理员
INSERT INTO users (email, password_hash, role, status, nickname, balance) 
VALUES ('auditor@3cloud.dev', '$2b$10$...', 'admin', 'active', '审核员', '0.000000');

-- 配置实名自动审核关闭（走人工审核流程）
-- system_configs key='real_name_auto_verify' value='false'

-- 配置分佣比例
-- system_configs key='agent_commission_rate' value='0.15'

-- 设置定价倍率
-- system_configs key='pricing_multiplier' value='1.33'

-- 配置折扣
-- system_configs key='new_user_discount' value='0.95'
```

---

## 三、详细测试场景 & 步骤（60 分钟紧凑安排）

### 🟢 Phase 1: 注册 & 认证（22:00-22:05）

#### 场景 1.1 — 正常用户注册
```
POST /api/v1/auth/register
Body: { "email": "test-a@3cloud.dev", "password": "Pass1234!", "refCode": "" }

预期:
  - HTTP 200, code: 0
  - 返回 accessToken, refreshToken, expiresIn
  - users 表新增记录, role='user', status='pending'
  - 验证邮箱链接已生成（检查 email-verification-codes）
```

#### 场景 1.2 — 重复邮箱注册（风控拦截）
```
POST /api/v1/auth/register
Body: { "email": "test-a@3cloud.dev", "password": "Pass1234!" }

预期: HTTP 409, message 含 "邮箱已被注册"
```

#### 场景 1.3 — 弱密码注册（前端+后端验证）
```
POST /api/v1/auth/register
Body: { "email": "test-weak@3cloud.dev", "password": "123456" }

预期: HTTP 400, ZodError, password 不符合规则
```

#### 场景 1.4 — 邮箱验证
```
POST /api/v1/auth/verify-email
Body: { "email": "test-a@3cloud.dev", "code": "<从数据库 emailVerificationCodes 表查>" }

预期: HTTP 200, users.status→'active', code 记录已标记 used
```

#### 场景 1.5 — 登录 & Token 刷新
```
# 登录
POST /api/v1/auth/login
Body: { "email": "test-a@3cloud.dev", "password": "Pass1234!" }

预期: HTTP 200, 返回 accessToken + refreshToken

# 验证 Token 有效
GET /api/v1/auth/me
Header: Authorization: Bearer <accessToken>
预期: 返回用户资料, role: user, balance: 0

# Token 刷新
POST /api/v1/auth/refresh
Body: { "refreshToken": "<refreshToken>" }
预期: 返回新的 accessToken
```

---

### 🟡 Phase 2: 实名 & 安全风控（22:05-22:13）

#### 场景 2.1 — 个人实名认证（人工审核流程）
```
# 上传证件
POST /api/v1/auth/real-name/upload
Header: Authorization: Bearer <token>
Body: multipart (身份证正反面图片)

# 提交实名
POST /api/v1/auth/real-name/personal
Header: Authorization: Bearer <token>
Body: { "name": "张三", "idNumber": "110101199001011234",
       "idFrontFileId": "<upload返回的id>",
       "idBackFileId": "<upload返回的id>" }

预期: HTTP 200, real_name_status='pending_review'
       real_name_records 表新增记录
       user_real_name_reviews 表新增记录

验证: 检查证件文件是否存到了 uploads 目录
```

#### 场景 2.2 — 企业实名认证
```
POST /api/v1/auth/real-name/enterprise
Header: Authorization: Bearer <token>
Body: { "companyName": "测试科技有限公司", "creditCode": "91110108MA01XXXXX",
       "legalPerson": "李四", "businessLicenseFileId": "<fileId>" }

预期: HTTP 200, pending_review
```

#### 场景 2.3 — 管理员审核实名
```
# 管理员登录
POST /api/v1/auth/login
Body: { "email": "auditor@3cloud.dev", "password": "Pass1234!" }

GET /api/v1/admin/real-name/pending  (预期: 列出待审核记录)

POST /api/v1/admin/real-name/review
Body: { "recordId": <id>, "action": "approve", "remark": "审核通过" }

预期: real_name_status→'approved', audit_logs 新增记录
```

#### 场景 2.4 — 登录安全（风控触发）
```
# 连续 5 次错误密码
POST /api/v1/auth/login × 5
Body: { "email": "test-a@3cloud.dev", "password": "wrong" }

预期: 第 5 次返回 429 或要求验证码
       security_events 表新增事件, type='brute_force'
       users.locked_until 被设置
```

#### 场景 2.5 — 异地/异常登录检测
```
# 模拟不同 IP 的请求 (可通过 X-Forwarded-For 头)
POST /api/v1/auth/login
Header: X-Forwarded-For: 1.2.3.4
Body: { "email": "test-a@3cloud.dev", "password": "Pass1234!" }

POST /api/v1/auth/login
Header: X-Forwarded-For: 5.6.7.8 (国外 IP)
Body: { "email": "test-a@3cloud.dev", "password": "Pass1234!" }

预期: geo-check 记录异常 IP,
       session_manager 记录不同地区登录,
       触发 security_event type='unusual_login'
```

---

### 🔵 Phase 3: API 调度 & 路由（22:13-22:28）

#### 场景 3.1 — API Key 创建 & 验证
```
# 用户 test-a 创建 API Key
POST /api/v1/api-keys
Header: Authorization: Bearer <token>
Body: { "name": "测试Key-1", "expiresAt": null }

预期: HTTP 200, 返回 sk-xxx 格式的 key (SHA-256 哈希存储)
       api_keys 表新增, 最后 4 位明文可见

# 验证 /v1/models
GET /v1/models
Header: Authorization: Bearer sk-<完整key>

预期: 返回模型列表, 格式兼容 OpenAI SDK
```

#### 场景 3.2 — 最低价路由（Chat Completion 非流式）
```
# 使用 API Key 调用
POST /v1/chat/completions
Header: Authorization: Bearer sk-<完整key>
Content-Type: application/json
Body: { "model": "deepseek-v4-pro", "messages": [{"role":"user","content":"Hello"}],
       "max_tokens": 50 }

预期:
  - HTTP 200, 返回 OpenAI 兼容格式 (choices, usage)
  - 路由引擎选择最低价厂商
  - call_logs 表新增记录, status='success'
  - balance 已扣费 (微超机制)
```

#### 场景 3.3 — 流式 Chat Completion (SSE)
```
POST /v1/chat/completions
Header: Authorization: Bearer sk-<完整key>
Body: { "model": "deepseek-v4-pro", "messages": [{"role":"user","content":"讲个故事"}],
       "stream": true, "max_tokens": 200 }

预期:
  - 返回 SSE stream (data: [DONE] 结尾)
  - 流毕统一结算（B 方案），累计 token 后扣费
  - call_logs 记录累加结果
```

#### 场景 3.4 — Embedding 调用
```
POST /v1/embeddings
Header: Authorization: Bearer sk-<完整key>
Body: { "model": "text-embedding-v3", "input": "测试文本嵌入" }

预期: HTTP 200, 返回 embedding 向量数组
       不同模型类型（chat vs embedding）路由正确
```

#### 场景 3.5 — 加权随机路由
```
# 修改路由策略（需要管理员 API）
PUT /api/v1/admin/routing-strategy
Header: Authorization: Bearer <admin_token>
Body: { "strategy": "weighted_random" }

# 并发调用 10 次
for i in 1..10:
  POST /v1/chat/completions (同场景 3.2)

预期: 调用按 vendor_models.weight 比例分布在多个厂商
```

#### 场景 3.6 — 限流触发
```
# 快速连续调用（超过 RPM）
for i in 1..30:
  POST /v1/chat/completions (不加延迟)

预期: 超过限流阈值后 HTTP 429
      响应头含 X-RateLimit-Remaining: 0
      Redis 中 rate_limit 计数器已达上限
```

#### 场景 3.7 — 厂商故障切换
```
# 模拟某厂商 down
PUT /api/v1/admin/vendors/1/status
Body: { "status": "down" }

# 调用发生故障切换
POST /v1/chat/completions (多次)

预期:
  - 自动跳过 down 厂商
  - 路由到下一个可用厂商
  - call_logs 记录使用的备用厂商
  - health_check 记录被跳过
```

#### 场景 3.8 — 余额不足 + 微超机制
```
# 创建一个极低余额用户
-- DB 直接设置 users.balance = '0.001000'

# 调用大模型消耗超过余额
POST /v1/chat/completions
Body: { "model": "gpt-4-turbo", "max_tokens": 1000 }

预期:
  - 允许走完（微超机制），不中断请求
  - 扣费后 balance 为负数（允许透支额度内）
  - call_logs 记录扣费详情
  - 用户后续请求被拒绝（余额低于阈值）
```

---

### 🟣 Phase 4: Key 管理 & 计费（22:28-22:34）

#### 场景 4.1 — 多 Key 分摊
```
# 创建第 2 个 Key
POST /api/v1/api-keys; Body: {"name":"Key-2"}

# 两个 Key 分别调用，确认各自 call_logs.apiKeyHash 不同
# balance_logs 关联到正确的 API Key
```

#### 场景 4.2 — 计费公式验证
```
# 调用后读取 call_logs
SELECT prompt_tokens, completion_tokens, total_tokens,
       cost, balance_before, balance_after
FROM call_logs
WHERE id = <last_call_id>

验证公式:
  cost = (prompt_tokens × sell_price_input + completion_tokens × sell_price_output)
         × pricing_multiplier × discount_rate
```

#### 场景 4.3 — 折扣生效
```
# 检查 system_configs.new_user_discount
# 新用户调用的 cost 是否应用了折扣
# 查看 balance_logs 的 discount_applied 字段
```

#### 场景 4.4 — Key 轮换 & 吊销
```
# 吊销 Key
DELETE /api/v1/api-keys/<keyId>
Header: Authorization: Bearer <token>

# 用已吊销的 Key 调用
POST /v1/chat/completions
Header: Authorization: Bearer sk-<revokedKey>

预期: HTTP 401, "API Key 无效"
```

---

### 🟠 Phase 5: 充值 & 财务管理（22:34-22:40）

#### 场景 5.1 — 在线充值（模拟微信扫码）
```
POST /api/v1/recharge
Header: Authorization: Bearer <token>
Body: { "amount": "100.000000", "channel": "wechat_scan" }

预期: HTTP 200, 返回 order_no + payment_url
       recharge_orders 表新增, status='pending'

# 模拟回调（直接修改状态）
PUT /api/v1/admin/recharge/confirm
Body: { "orderNo": "<order_no>", "remark": "模拟回调确认" }

预期: status→'paid', users.balance +100
       balance_records 新增入账记录
```

#### 场景 5.2 — 对公转账
```
POST /api/v1/recharge
Body: { "amount": "5000.000000", "channel": "bank_transfer" }

预期: HTTP 200, 返回银行账户信息和 order_no

# 管理员确认
PUT /api/v1/admin/recharge/confirm
Body: { "orderNo": "<order_no>", "remark": "对公转账确认" }

预期: status→'confirmed', users.balance +5000
```

#### 场景 5.3 — 充值风控（大额触发）
```
POST /api/v1/recharge
Body: { "amount": "100000.000000", "channel": "wechat_scan" }

预期: 触发 payment_security 风控检查
      recharge_orders.review_status 标记为 'pending_review'
      security_events 新增 type='large_recharge'
```

#### 场景 5.4 — 余额查询 & 流水
```
GET /api/v1/auth/me
→ 验证 balance 字段

GET /api/v1/logs/balance?page=1&limit=20
→ 验证流水列表，含收入和支出记录
```

---

### 🟤 Phase 6: 团队 & 代理商（22:40-22:46）

#### 场景 6.1 — 创建团队 & 邀请成员
```
# 用户 test-a 创建团队
POST /api/v1/team/create
Header: Authorization: Bearer <token>
Body: { "name": "测试研发团队" }

预期: HTTP 200, team 表新增, test-a 为 team_owner

# 邀请成员
POST /api/v1/team/invite
Body: { "email": "user-b@3cloud.dev", "role": "team_member" }

预期: team_invitations 新增，发送通知
```

#### 场景 6.2 — 团队 API Key & 用量
```
# 团队管理员创建团队级 Key
POST /api/v1/team/api-keys
Body: { "name": "团队Key", "teamId": <teamId> }

# 用团队 Key 调用 → 扣团队余额
调用验证同上 Phase 3
```

#### 场景 6.3 — 代理商注册 & 绑定客户
```
# 用代理商角色注册
POST /api/v1/auth/register
Body: { "email": "agent-a@3cloud.ai", "password": "Agent1234!" }

# 管理员提升为代理商
PUT /api/v1/admin/users/role
Body: { "userId": <agentUserId>, "role": "agent" }

# 代理商绑定客户
POST /api/v1/agent/clients
Body: { "clientUserId": <test-a UserId> }
```

#### 场景 6.4 — 代理商分佣验证
```
# test-a 用户消费后
# 检查 agent_commissions 表是否产生分佣记录
SELECT * FROM agent_commissions WHERE agent_id = <agentId>
→ commission_amount = 消费额 × commission_rate

# 检查代理商面板
GET /api/v1/agent/dashboard
→ 展示待结算佣金、客户数、本月消费
```

---

### 🔴 Phase 7: 管理后台（22:46-22:54）

#### 场景 7.1 — 用户管理
```
# 管理员登录 → 用户列表
GET /api/v1/admin/users?page=1&limit=20
→ 确认包含所有角色

# 禁用用户
PUT /api/v1/admin/users/<userId>/disable
Body: { "reason": "违规调用" }

# 验证被禁用用户请求被拒
POST /v1/chat/completions (用该用户的 Key)
→ HTTP 403, "用户已被禁用"
```

#### 场景 7.2 — 厂商管理
```
# 厂商列表
GET /api/v1/admin/vendors
→ 状态分布: active/down/degraded/disabled

# 添加临时厂商
POST /api/v1/admin/vendors
Body: { "name": "测试厂商-TEMP", "status": "active" }

# 删除厂商
DELETE /api/v1/admin/vendors/<id>
```

#### 场景 7.3 — 模型 & 定价管理
```
# 模型列表
GET /api/v1/admin/models

# 调整定价
PUT /api/v1/admin/vendor-models/<id>
Body: { "sellPriceInput": "0.000015", "sellPriceOutput": "0.000060" }

# 验证新定价在下一次路由中生效
```

#### 场景 7.4 — 仪表盘
```
GET /api/v1/admin/dashboard
→ 总用户数 / 今日注册 / 今日调用量 / 今日收入 / 活跃厂商

# 对比 DB 总数，验证数据一致性
```

#### 场景 7.5 — 系统配置
```
# 查看系统配置
GET /api/v1/admin/system/configs

# 修改配置
PUT /api/v1/admin/system/configs
Body: { "key": "pricing_multiplier", "value": "1.50" }

# 验证清除缓存后生效
```

#### 场景 7.6 — 安全中心
```
GET /api/v1/admin/security/events?page=1&limit=20
→ 查看所有 security_events (暴力破解、异常登录、大额充值等)

GET /api/v1/admin/security/login-logs
→ 用户登录历史

# 解锁被锁定的用户
PUT /api/v1/admin/security/unlock
Body: { "userId": <lockedUserId> }
```

---

### ⚫ Phase 8: 费用结算（22:54-23:00）

#### 场景 8.1 — 佣金结算（定时任务触发）
```
# 触发结算（模拟 cron 定时任务）
# 直接调用 settleCommissions()
-> 检查 commissionLogs 中所有 pending→settled

# 验证:
  - commission_logs.status → 'settled'
  - agents.total_commission 更新
  - 生成了 settlement 凭证号(voucher_no)
```

#### 场景 8.2 — 代理商提现
```
# 代理商提交提现
POST /api/v1/agent/withdraw
Body: { "amount": "50.000000", "bankCard": "622202****1234" }

预期: withdraw_orders 新增,
       status = 'pending_first_review'

# 管理员一审通过
PUT /api/v1/admin/withdraw/review
Body: { "withdrawId": <id>, "action": "approve", "reviewLevel": "first" }
→ status = 'pending_second_review'

# 管理员二审通过
PUT /api/v1/admin/withdraw/review
Body: { "withdrawId": <id>, "action": "approve", "reviewLevel": "second" }
→ status = 'approved'

# 确认打款（财务）
PUT /api/v1/admin/withdraw/paid
Body: { "withdrawId": <id>, "voucherNo": "PAY20260628xxx" }
→ status = 'paid'
```

#### 场景 8.3 — 日终对账（余额校验）
```
# 收取所有 balance_records
SELECT user_id, SUM(change_amount) as total_change FROM balance_records GROUP BY user_id

# 对比 users.balance
SELECT id, balance FROM users

# 检查是否存在不一致
→ SUM(change) = balance (对账成功)
→ 若有差异，记录对账异常到审计日志
```

---

## 四、测试脚本 & 工具

### 4.1 推荐测试方式

| 方式 | 适用场景 | 说明 |
|------|---------|------|
| **curl / PowerShell** | Phase 1-2 全量 + Phase 5-8 全量 | 手动按场景执行，适合精细验证 |
| **Playwright 浏览器** | 前端 UI 流程（注册页面、控制台） | 用 browser tool 操作 |
| **并发测试（脚本）** | Phase 3.5-3.7 限流和路由 | 用简单 for 循环模拟并发 |
| **DB 直查** | 每个场景后验证 DB 状态 | psql / drizzle-studio |

### 4.2 验证清单（每场景标记）

```
Test Date: 2026-06-28
├── 🟢 Phase 1 注册认证 [ ] [ ] [ ] [ ] [ ]
├── 🟡 Phase 2 实名风控 [ ] [ ] [ ] [ ] [ ]
├── 🔵 Phase 3 API 调度 [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ]
├── 🟣 Phase 4 Key 管理 [ ] [ ] [ ] [ ]
├── 🟠 Phase 5 充值财务 [ ] [ ] [ ] [ ]
├── 🟤 Phase 6 团队代理 [ ] [ ] [ ] [ ]
├── 🔴 Phase 7 管理后台 [ ] [ ] [ ] [ ] [ ] [ ]
└── ⚫ Phase 8 费用结算 [ ] [ ] [ ]
```

### 4.3 一键测试脚本（PowerShell）

```powershell
# 简化版，用于 Phase 1+3，可做成 .ps1 文件

$BASE = "http://localhost:3000"

# 1. 注册
$reg = Invoke-RestMethod -Uri "$BASE/api/v1/auth/register" -Method POST `
  -Body (@{email="ps-test@3cloud.dev";password="Test1234!"} | ConvertTo-Json) `
  -ContentType "application/json"
$token = $reg.data.accessToken
$refresh = $reg.data.refreshToken
Write-Host "✅ 注册成功, token=$($token.Substring(0,20))..."

# 2. 登录验证
$me = Invoke-RestMethod -Uri "$BASE/api/v1/auth/me" -Method GET `
  -Headers @{Authorization="Bearer $token"}
Write-Host "✅ 登录验证: $($me.data.email) / $($me.data.role)"

# 3. 创建 API Key
$key = Invoke-RestMethod -Uri "$BASE/api/v1/api-keys" -Method POST `
  -Headers @{Authorization="Bearer $token"} `
  -Body (@{name="ps-test-key"} | ConvertTo-Json) `
  -ContentType "application/json"
Write-Host "✅ API Key: $($key.data.key)"

# 4. 调用模型
$result = Invoke-RestMethod -Uri "$BASE/v1/chat/completions" -Method POST `
  -Headers @{Authorization="Bearer $($key.data.key)"} `
  -Body (@{model="deepseek-v4-pro";messages=@(@{role="user";content="hi"})} | ConvertTo-Json) `
  -ContentType "application/json"
Write-Host "✅ 模型调用完成, tokens=$($result.usage.total_tokens)"
```

---

## 五、预期产出

测试完成后，应产出：

| 产出物 | 用途 |
|--------|------|
| ✅ 每个场景的通过/失败标记 | 系统功能完整性报告 |
| ✅ DB 数据一致性检查结果 | 财务/计费正确性 |
| ✅ Security events 完整记录 | 风控链路有效性 |
| ✅ 定时任务触发验证 | 结算流程自动化 |
| ✅ 发现的 Bug / 待优化项 | 开发迭代输入 |

---

## 六、风险 & 注意事项

1. **厂商调用是模拟的** — proxy 路由会真实转发到上游，注意厂商 API Key 有效性和配额
2. **修改 system_configs 会影响已有用户** — 测试完记得恢复原值
3. **禁用/锁定用户后** — 记得测试完解锁
4. **Redis 数据在重启后丢失** — 如果重启服务，速率限制数据会重置，不影响测试
5. **微超导致的负余额** — 需要确认系统后续允许充值或限制
6. **建议测试前备份 DB** — `pg_dump -U postgres threecloud > backup_before_test.sql`

---

## 七、状态 & 后续

| 状态 | 说明 |
|------|------|
| 📋 **方案已出** | 你可以先过一遍 |
| ⏳ **待你确认** | 确认后我可以按 Phase 顺序逐场景执行 |
| 🔄 **可以调整** | 有遗漏或调优需求随时说 |

---

> 开始执行前，建议先备份 DB。要现在开工吗？
