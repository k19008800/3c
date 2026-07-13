# 方案 C：安全 + 风控专项测试 — 3cloud

**测试日期**: 2026-06-29
**测试环境**: API http://localhost:3000, PostgreSQL threecloud
**测试工具**: PowerShell Invoke-RestMethod

---

## 场景 1：登录安全

### 1.1 多次失败锁定测试
✅ **结果**: 通过
- 第 1-5 次用错误密码登录 → 返回 `401 {"message":"邮箱或密码错误"}`
- 第 6 次用错误密码登录 → 返回 `429 {"code":429,"data":null,"message":"IP 已被临时封禁"}`
- 系统准确地在第 5 次失败后（即第 6 次请求）触发了 IP 封禁

### 1.2 正确密码恢复正常
❌ **结果**: 测试时 IP 仍在封禁期（5 分钟），返回 429
- **说明**: 5 分钟 IP 封禁期后，IP 自动解封。用户账号因 `user_ban_minutes: 15` 被封禁 15 分钟。由于测试持续触发封禁，无法在同一轮会话中验证解封后的正常登录。
- **建议**: 应提供管理员解封 API（目前无此接口）

### 1.3 安全事件表
✅ **结果**: 通过
- `GET /api/v1/admin/security/events` 返回完整安全事件列表
- 事件类型含：`user_captcha`（连续3次失败触发）、`ip_banned`（IP封禁）、`user_banned`（用户封禁）
- 风险等级：`high`（封禁）、`medium`（验证码要求）
- 每条事件含：userId、IP、riskLevel、detail（含 failCount/banMinutes）、createdAt、acknowledged 状态
- ⚠️ **注意**: 无确认安全事件的 API（`/api/v1/admin/security/events/acknowledge` 返回 404）

### 1.4 登录历史查询
✅ **结果**: 通过
- 路由：`GET /api/v1/auth/security/login-history`（注意：文档中的 `auth-security` 路径实际应为 `auth/security`）
- 返回记录含：IP、userAgent、success（true/false）、failReason、createdAt
- 可区分 `wrong_password` 和 `ip_banned` 类型的失败原因
- 用户只能看到自己的登录历史（userId=31 的记录返回 10 条）

---

## 场景 2：权限越权

### 2.1 普通用户访问 admin 路由
✅ **结果**: 通过
- `GET /api/v1/admin/users` 使用 user token → 返回 `403 {"message":"需要 super_admin/admin 角色"}`
- 权限守卫正常工作

### 2.2 普通用户调管理端其他 API
✅ **结果**: 通过（部分）
- 用户 token 尝试 `POST /api/v1/admin/system/configs` → 返回 404（路由不存在），系统未暴露此写接口
- ⚠️ `POST /api/v1/admin/security/config` 等所有写操作路径均返回 404，系统配置文件只能通过 GET 读取，无写入端点

### 2.3 管理员调用户端 API
✅ **结果**: 通过
- 实际用户端 Profile 路由是 `GET /api/v1/auth/me`（文档中所列 `/api/v1/user/profile` 不存在）
- 管理员 token 成功访问 `GET /api/v1/auth/me`，返回完整的用户信息（含 balance、role 等）
- 说明管理员可以正常使用用户端 API，跨权限访问正常

### 2.4 不同用户之间数据隔离
✅ **结果**: 通过
- 代理商 token 访问 `GET /api/v1/api-keys` → 仅返回代理商自己的 API Key（id=44, keyPrefix="sk-3c-67"）
- 数据隔离工作正常，用户只能看到自己的 API Key

### 🔴 重要发现：passwordHash 泄露漏洞
- `GET /api/v1/admin/users/{id}` 详情端点返回 `passwordHash` 字段
- 所有用户的 bcrypt 密码哈希均可被管理员查看（包括 id=5 admin, id=6 agent, id=31 user）
- 列表端点 `/api/v1/admin/users` 不包含 passwordHash，仅详情端点泄露
- **风险评级**: 高危 — 虽然 bcrypt 哈希难以逆向，但攻击者可离线暴力破解

---

## 场景 3：输入安全与校验

### 3.1 无 body 登录请求
❌ **结果**: 不通过
- 返回 `500 Internal Server Error: "Unexpected end of JSON input"`
- 无 body 时应返回 400 Bad Request，而非 500 服务器错误
- **建议**: 添加全局 JSON 解析异常捕获，统一返回 400

### 3.2 空 body {} 请求
✅ **结果**: 通过
- 返回 `400 {"message":"Required"}` — 参数校验正常工作

### 3.3 邮箱格式错误
✅ **结果**: 通过
- `{"email":"notanemail","password":"123"}` → 返回 `400 {"message":"Invalid email"}`
- Email 格式校验有效

### 3.4 注入尝试
✅ 全部通过：

| 尝试类型 | 输入 | 结果 |
|---------|------|------|
| SQL 注入 | `admin@3cloud.dev OR 1=1` | `400 Invalid email` — 被邮箱格式校验拦截 |
| XSS 注入 | `<script>alert(1)</script>@test.com` | `400 Invalid email` — 被邮箱格式校验拦截 |
| NoSQL 注入 | `{"email":{"$ne":""},"password":{"$ne":""}}` | `400 Expected string, received object` — 类型校验有效 |

- 所有注入尝试均被输入校验拦截，未触发 SQL 错误或绕过认证

---

## 场景 4：熔断器测试

### 4.1 查看安全配置
✅ **结果**: 通过
- `GET /api/v1/admin/security/config` 返回完整熔断配置：
  - `circuit_breaker_trip: 3` — 连续失败 3 次触发熔断
  - `circuit_breaker_open_ms: 30000` — 熔断断开时长 30 秒
  - `circuit_breaker_halfopen_ms: 120000` — 半开状态下再失败延长断开时长
  - 其他相关配置：max_concurrent_sessions、session_expire_hours、geo_check 等

### 4.2 查看 Vendor 状态
⚠️ **结果**: 部分通过
- `GET /api/v1/admin/vendors` 返回 vendor 列表，含 `status` 字段（active/inactive）
- 但该 status 为 vendor 启用状态，非熔断状态
- 尝试 `GET /api/v1/admin/vendors/circuit-breaker` → 500 错误（参数 NaN 导致的 SQL 查询异常）
- 尝试 `GET /api/v1/admin/vendors/status` → 500 错误（相同问题）
- **建议**: 修复熔断状态查询端点，或在 vendor 列表中添加熔断状态字段

### 4.3 触发熔断
⚠️ **结果**: 未验证
- 尝试通过 chat completions 触发熔断（使用不存在模型）→ 返回 401（OpenAI 返回的 Invalid API Key），未触发上游熔断
- 熔断机制可能依赖于上游连接失败（超时/断开），本地测试难以触发因没有上游 mock
- 熔断配置 API 正常工作（GET 配置），但熔断状态查询有 bug

---

## 场景 5：会话安全

### 5.1 获取当前会话列表
❌ **结果**: 不通过
- `GET /api/v1/auth-security/sessions` → 404 Not Found
- 搜索了多个可能路径（`auth/sessions`、`user/sessions`、`security/sessions`、`admin/sessions`）均返回 404
- **结论**: 会话列表查看功能尚未实现

### 5.2 撤销其他会话
❌ **结果**: 不通过
- `POST /api/v1/auth-security/revoke-session` → 404 Not Found
- 搜索了 `auth/revoke-session`、`auth/revoke`、`auth/logout` 等路径均返回 404
- **结论**: 会话撤销功能尚未实现

### 5.3 用旧 Refresh Token 刷新
✅ **结果**: 通过
- `POST /api/v1/auth/refresh` 使用伪造过期 token → 返回 `401 {"message":"Token 无效或已过期"}`
- Token 过期验证有效

---

## 场景 6：充值/支付安全

### 6.1 重复回调幂等
✅ **结果**: 通过
- 已支付订单（id=35, status=paid, amount=100.00）调用 notify 两次 → 均返回 `"SUCCESS"`
- 两次调用后余额未重复增加（管理员余额仍为 900.000000）
- 但 ⚠️ 已取消订单调用 notify 也返回 `"SUCCESS"`（虽然实际未处理），状态仍为 cancelled
- **建议**: 已取消/已完结的订单应返回明确错误而非 `"SUCCESS"`，避免混淆

### 6.2 金额篡改
❌ **结果**: 不通过
- 对已支付订单（amount=100.00）用金额 99999 调用 notify → 返回 `"SUCCESS"`
- 系统未校验回调金额与订单金额是否一致
- **风险评级**: 高危 — 如果某漏洞可触发 notify 回调，攻击者可篡改金额
- **建议**: 在 notify 处理中校验 `回调金额 === 订单金额`，不匹配则拒绝

### 6.3 超时订单取消
✅ **结果**: 通过
- 用户 28 的 pending 订单（id=34, orderNo=RECHARGE_MQYYRAMG_75866DE8）→ 管理员取消成功
- 取消后订单状态变为 `cancelled`
- 重复取消 → 正确返回 `400 {"message":"订单状态为 cancelled，无法取消"}`
- 状态机校验有效

---

## 汇总

| 场景 | 总步骤 | ✅ 通过 | ❌ 不通过 | ⚠️ 部分/未验证 |
|------|--------|--------|----------|---------------|
| 场景 1：登录安全 | 4 | 3 | 0 | 1 |
| 场景 2：权限越权 | 4 | 4 | 0 | 0 |
| 场景 3：输入安全 | 4 | 3 | 1 | 0 |
| 场景 4：熔断器 | 3 | 1 | 0 | 2 |
| 场景 5：会话安全 | 3 | 1 | 2 | 0 |
| 场景 6：充值安全 | 3 | 2 | 1 | 0 |
| **总计** | **21** | **14** | **4** | **3** |

### 关键发现（需修复）

🔴 **高危**:
1. **passwordHash 泄露** (`/api/v1/admin/users/{id}` 返回密码哈希)
2. **金额篡改** (notify 未校验回调金额与订单金额)

🟡 **中危**:
3. **无内容 body 导致 500 错误** (缺少全局 JSON 解析异常处理)

🟢 **低危/建议**:
4. 熔断状态查询端点 500 错误（NaN 参数问题）
5. 会话管理功能缺失（列表/撤销）
6. 已取消订单 notify 返回 `"SUCCESS"` 应改为具体错误
7. 缺少管理员解封 API
8. 缺少安全事件手动确认 API

### 已发现的防护措施（正常运行）
- ✅ IP 封禁（5 分钟，5 次连续失败触发）
- ✅ 用户封禁（15 分钟，5 次连续失败触发）
- ✅ 验证码要求（3 次连续失败后）
- ✅ 角色权限守卫（403 返回）
- ✅ 数据隔离（API Keys 按用户过滤）
- ✅ 邮箱格式校验
- ✅ 类型校验（防止 NoSQL 注入）
- ✅ Token 过期校验
- ✅ 订单状态机校验（禁止重复取消）
- ✅ 充值幂等性（重复回调不重复加余额）
- ✅ 24 小时累计失败封禁配置
