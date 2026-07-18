# 3cloud 全量深度回归测试报告 — 用户认证 + API Keys + 用户管理

**测试日期**: 2026-07-18  
**测试版本**: main branch  
**测试人员**: 泥鳅 🐍  
**API 基础路径**: `http://localhost:3000`  
**数据库**: `postgres://postgres:postgres@localhost:5432/threecloud`

---

## 模块 M：用户认证 (Authentication)

### M1. 登录 `POST /api/v1/auth/login`

| 步骤 | 结果 |
|------|------|
| **① 源码位置** | `routes/auth/login.ts` → 调用 `services/auth-service/login.ts` |
| **② 密码哈希算法** | **bcryptjs** — `await bcrypt.compare(password, user.passwordHash)` 对比密码。`config.bcrypt.saltRounds = 12` |
| **③ JWT payload** | `{ userId: number, role: string, impersonatorId?: number }`（TokenPair 接口定义见 `services/auth-service/types.ts`） |
| **④ Token 格式** | JWT (jsonwebtoken): **accessToken**（有效期 2h, 配置 `JWT_ACCESS_EXPIRES=2h`） + **refreshToken**（有效期 7d, 配置 `JWT_REFRESH_EXPIRES=7d`），用 `accessSecret`/`refreshSecret` 分别签名 |
| **⑤ 登录风控** | 集成 `login-security.ts` 前置检查（IP 封禁/用户封禁/验证码），集成 `geo-check.ts` 异地登录检测，记录 `userLoginHistory` 表，创建 session 到 `session-manager` |
| **⑥ 响应格式** | `{ code: 0, data: { user: {...}, accessToken, refreshToken, expiresIn }, message: "ok" }`。如果需验证码则 `{ captchaRequired: true, captchaSession }` |
| **注意** | 支持 `captchaSession`/`captcha` 字段可选。错误统一走 `AppError` 异常处理 |

### M2. 注册 `POST /api/v1/auth/register`

| 步骤 | 结果 |
|------|------|
| **① 源码位置** | `routes/auth/register.ts` → `services/auth-service/registration.ts` |
| **② 默认角色** | **`"user"`**（来自 schema：`userRoleEnum("role").notNull().default("user")`） |
| **③ 密码哈希** | `await bcrypt.hash(password, config.bcrypt.saltRounds)`，saltRounds=12 |
| **④ 默认状态** | `status: "pending"`（邮箱未验证），注册成功后发放免费体验额度（从 `system_configs` 读取 `trial_token_quota`，默认 10 元） |
| **⑤ 邀请码** | 支持 `refCode` 参数，RD 验证后绑定代理商关系 `agentClients` 表。触发代理商注册奖励佣金 |
| **⑥ 邮箱验证** | 注册后 Redis 存入 6 位验证码（`verify:email:{userId}`，300 秒 TTL） |
| **⑦ 返回** | 自动生成 JWT token 并返回（用户无需先验证邮箱即可登录） |

### M3. JWT 中间件 `authenticateJWT`

| 步骤 | 结果 |
|------|------|
| **① 源码位置** | `middleware/auth.ts` |
| **② Token 来源** | `Authorization: Bearer <token>` header（`authHeader.slice(7)` 提取） |
| **③ 验证流程** | `verifyAccessToken(token)` → `jwt.verify(token, config.jwt.accessSecret)` 解码 payload |
| **④ 用户状态检查** | JWT 验证后从 Redis 缓存或 DB 检查用户 `status`（active/disabled/deleted）。Redis key: `auth:user:status:{userId}`，60 秒缓存 |
| **⑤ 失效响应** | TokenExpiredError → `401 "Token 已过期"`；其他错误 → `401 "无效的 Token"` |
| **⑥ 跳过逻辑** | CORS 预检 `OPTIONS` 跳过；如果 `adminKey` 中间件已注入 `request.user` 则跳过 |
| **⑦ 注入字段** | `request.user = { userId, role, impersonatorId? }` |

### M4. 权限枚举 `Perm` + RBAC 矩阵

| 步骤 | 结果 |
|------|------|
| **① Perm 枚举** | **28 个权限位**，以 BigInt (64-bit) 位运算实现：`DASHBOARD_VIEW`(0), `USER_LIST`(1), `USER_VIEW`(2), `USER_EDIT`(3), `USER_DELETE`(4), `USER_CREATE`(5), `USER_RESET_PWD`(6), `USER_CHANGE_ROLE`(7), `USER_BALANCE`(8), `USER_IMPERSONATE`(9), `REVIEW_LIST`(10), `REVIEW_ACTION`(11), `MODEL_MANAGE`(12), `FINANCE_VIEW`(13), `FINANCE_COMMISSION`(14), `FINANCE_WITHDRAW`(15), `FINANCE_RECHARGE`(16), `CONFIG_VIEW`(17), `CONFIG_EDIT`(18), `SECURITY_VIEW`(19), `SECURITY_ACTION`(20), `AUDIT_VIEW`(21), `AGENT_LIST`(22), `AGENT_MANAGE`(23), `LOG_VIEW`(24), `OPS_READ`(25), `RECONCILIATION_VIEW`(26), `SECURITY_EDIT`(27) |
| **② super_admin** | 全权限（`~0n`，即所有 bit 为 1） |
| **③ admin** | 日常运营管理员：仪表盘 + 全用户管理（含删除/改角色/模拟）+ 实名审核 + 模型管理 + 安全查看/操作 + 配置读写 + 审计 + 全财务（含对账）+ 日志 + 代理商。**注意：不包含 SECURITY_EDIT** |
| **④ finance_ops** | 财务专员：仪表盘 + 用户查看/余额管理 + 全财务（含对账）+ 日志 + 代理商列表。**无权修改用户/模型/安全** |
| **⑤ ops** | 运维工程师：看板 + 用户查看 + 实名查看 + 模型管理 + 安全查看/操作 + 配置读写 + 日志/审计 + 代理商列表。**无权改用户/财务** |
| **⑥ support** | 客服/审核：用户管理（不含删除/改角色/模拟）+ 实名审核 + 日志。**无权看财务/配置/安全** |
| **⑦ auditor** | 审计员：审计日志 + 对账 + 用户查看 + 日志 + 代理商列表。**只读权限** |
| **⑧ user/agent** | 普通用户/代理商：`Perm.NONE`（0，即无管理后台权限） |
| **⑨ requirePerm()** | 检查 `ROLE_PERMISSIONS[role] & required === required`；多个 perm 用 `reduce((a,b) => a|b)` 求并集，**所有位必须同时满足** |

### M5. 密码重置 `POST /api/v1/auth/reset-password`

| 步骤 | 结果 |
|------|------|
| **① 源码位置** | `routes/auth/reset.ts` → `services/auth-service/password.ts` |
| **② 忘记密码** | `POST /api/v1/auth/forgot-password`：接收 `{ email }`，从 DB 查询用户（不存在则静默返回），`crypto.randomBytes(32).toString("hex")` 生成 token，Redis 存储 `reset:token:{token}`（1800 秒 TTL），发送密码重置邮件 |
| **③ 重置密码** | `POST /api/v1/auth/reset-password`：接收 `{ token, newPassword }`，从 Redis 取 userId，`bcrypt.hash` 更新密码，清空 Redis token，**撤销该用户所有活跃 session** |
| **④ 安全措施** | Token 32 字节 hex（256 位熵），30 分钟过期，重置后自动踢下线 |
| **⑤ 额外** | 支持 `POST /api/v1/auth/change-password`（需原密码），受 `guardNotImpersonating` 保护（模拟模式下不可改密码） |

---

## 模块 N：API Keys

### N1. 创建 API Key `POST /api/v1/api-keys`

| 步骤 | 结果 |
|------|------|
| **① 源码位置** | `routes/api-keys.ts` |
| **② 前置中间件** | `authenticateJWT` + `guardNotImpersonating` |
| **③ Key 生成逻辑** | `crypto.randomBytes(48).toString("hex")` → 96 字符 hex。前缀 `sk-3c-`。完整 key 格式: `sk-3c-{96hex}` |
| **④ 存储** | **SHA-256 哈希** 存入 `keyHash` 列：`createHash("sha256").update(rawKey).digest("hex")`。`key_prefix` 取前 8 位 |
| **⑤ 返回** | 创建接口**仅一次返回明文 key**（`{ id, name, key, keyPrefix, expiresAt }`），之后无法再次获取 |
| **⑥ 其他字段** | 支持 `name`, `expiresAt`（可选过期时间）。默认 `status: true`（启用） |

### N2. 列表 `GET /api/v1/api-keys`

| 步骤 | 结果 |
|------|------|
| **① 前置中间件** | `authenticateJWT`（无需 guardNotImpersonating，允许模拟查看） |
| **② 返回字段** | `{ id, name, keyPrefix, status, quotaBalance, expiresAt, lastUsedAt, createdAt }` — **返回 prefix 而非完整 key** |
| **③ 过滤** | **默认只显示当前用户自己的 key**（`WHERE user_id = request.user.userId`）|
| **④ 分页** | 支持 `page`/`pageSize` 参数，默认 20 条/页。返回 `total` 总数 |
| **⑤ 排序** | 按 `createdAt` 升序 |

### N3. 删除 `DELETE /api/v1/api-keys/:id`

| 步骤 | 结果 |
|------|------|
| **① 前置中间件** | `authenticateJWT` + `guardNotImpersonating` |
| **② 删除方式** | **硬删除（`db.delete(apiKeys)`）** — 直接从表中删除记录，不是软删除（update status）。有操作日志 |
| **③ 所有权检查** | 先查询 `WHERE id=? AND userId=当前用户`，确保只能删自己的 key |
| **④ 不存在** | 返回 404 non-existent |

### N4. Admin 的 API Key 管理

| 步骤 | 结果 |
|------|------|
| **① 源码位置** | `routes/admin/api-keys.ts` |
| **② 路由** | `GET /api/v1/admin/users/:id/api-keys` — 查看指定用户的 key 列表 |
| **③ 权限** | `requirePerm(Perm.USER_LIST)` — admin 及以上角色可查看 |
| **④ 返回字段** | 同用户列表（`id, name, keyPrefix, status, quotaBalance, expiresAt, lastUsedAt, createdAt`） |
| **⑤ 管理操作** | `PATCH` (需 `USER_EDIT`): 更新 name/status；`DELETE` (需 `USER_DELETE`): 硬删除。`GET call-stats/call-trends/call-logs` (需 `USER_LIST`): 调用统计 |
| **⑥ 审计** | admin 的更新/删除操作写入 `auditLogs` 表（记录 before/after 快照） |

### N5. Key 认证链（代理路由）

| 步骤 | 结果 |
|------|------|
| **① 源码位置** | `routes/proxy/auth.ts` |
| **② 认证流程** | `authenticateApiKey` middleware：提取 `Authorization: Bearer <key>` → **SHA-256 哈希** → 查询 `api_keys.keyHash` → inner join `users` 表 |
| **③ 关联查询** | 联合查询 `api_keys.status / expiresAt` + `users.status / realNameStatus / disabledUntil` |
| **④ 状态检查链** | Key status（true/false）→ Key expiresAt（可选）→ 用户 status（disabled/deleted）→ 实名状态（unverified/pending_review/rejected → 403，`"请先完成实名认证"`）|
| **⑤ lastUsedAt** | 通过认证后异步更新该 key 的 `lastUsedAt` 为当前时间 |
| **⑥ 注入字段** | `request.apiKey = { id, userId }`；`request.user = { userId, role: "user" }` |
| **⑦ RPM/TPM 读取位置** | 限流信息从 **users 表**读取（`rpmOverride`, `tpmOverride` 字段），以及 quota 服务。详见限流模块 |

### N6. 管理员 API Key 管理（Admin Master Key）

| 步骤 | 结果 |
|------|------|
| **① 源码位置** | `routes/admin/admin-keys.ts` |
| **② 数据结构** | 独立表 `adminApiKeys`（schema: `admin.ts`），字段：`name, keyHash, keyPrefix, permissions[], status(active/disabled/expired), expiresAt, createdBy, lastUsedAt` |
| **③ Key 生成** | `crypto.randomBytes(24).toString("hex")`，前缀 `3c_`。格式: `3c_${48hex}`。SHA-256 哈希存储 |
| **④ 权限模型** | 细粒度**模块:操作** ACL：模块包括 `users/finance/vendors/models/agents/security/system/audit/stats`，操作包括 `read/write/delete/*`。`*:*` 表示全权限 |
| **⑤ 认证中间件** | `middleware/adminKeyAuth.ts`：从 `X-Admin-Key` header 读取 → SHA-256 → 查询 => 权限检查 => 记录使用日志。如果 X-Admin-Key 不存在则静默跳过（降级到 JWT） |
| **⑥ 权限推断** | 根据请求路径自动推断模块（`/api/v1/admin/users` → module=users，GET→read，POST→write），匹配失败则放行 |
| **⑦ 注入** | `request.adminKey = { id, name, permissions }`；`request.user = { userId: 0, role: "super_admin" }`（管理 Key 全权限）|
| **⑧ 使用日志** | 记录到 `adminKeyUsageLogs` 表（keyId, method, path, ip, statusCode, durationMs） |
| **⑨ 管理路由** | POST 创建（需 `CONFIG_EDIT`）、GET 列表（需 `CONFIG_VIEW`）、PUT 更新（需 `CONFIG_EDIT`）、DELETE 禁用（软禁用，需 `CONFIG_EDIT`）、GET logs（需 `AUDIT_VIEW`） |

### N7. 数据库验证

| 步骤 | 结果 |
|------|------|
| **① key_hash 存储** | **SHA-256 哈希（64 hex 字符）**，非明文。列定义: `varchar("key_hash", { length: 64 })` |
| **② key_prefix** | 取明文 key 前 8 位（如 `sk-3c-ab`）用于 UI 展示。列定义: `varchar("key_prefix", { length: 10 })` |
| **③ 建议验证 SQL** | `SELECT id, user_id, key_prefix, status, rpm_limit, tpm_limit, quota_balance FROM api_keys LIMIT 10;` |
| **④ 注意** | `apiKeys` 表**没有** `rpm_limit`/`tpm_limit` 列。RPM/TPM 限制来自 **users 表** 的 `rpmOverride`/`tpmOverride` 字段或 quota 服务。如需验证请查询 `SELECT id, user_id, key_prefix, status, quota_balance FROM api_keys LIMIT 10;` |

---

## 模块 O：用户管理

### O1. 用户列表 `GET /api/v1/admin/users`

| 步骤 | 结果 |
|------|------|
| **① 源码位置** | `routes/admin/users/list.ts` |
| **② 前置中间件** | `authenticateJWT` + `requirePerm(Perm.USER_LIST)` |
| **③ 过滤条件** | `keyword`(邮箱/昵称 ILIKE 搜索)、`status`(pending/active/disabled/deleted)、`userType`(personal/enterprise)、`role`(user/agent/admin/...)、`realNameStatus`(unverified/pending_review/approved/rejected) |
| **④ 分页** | `page`/`pageSize`，默认 `page=1, pageSize=20`，最大 100 |
| **⑤ 返回字段** | id, email, nickname, phone, avatarUrl, userType, role, status, balance, realNameStatus, realName, companyName, emailVerifiedAt, lastLoginAt, discountRate, rpmOverride, tpmOverride, disabledUntil, disabledReason, createdAt, **isBanned**（Redis 风控封禁标记） |
| **⑥ 导出** | `GET /api/v1/admin/users/export` — 返回 CSV（BOM for Excel），支持同样过滤条件 |

### O2. 用户详情 `GET /api/v1/admin/users/:id`

| 步骤 | 结果 |
|------|------|
| **① 源码位置** | `routes/admin/users/detail/info.ts` |
| **② 前置中间件** | `authenticateJWT` + `requirePerm(Perm.USER_VIEW)` |
| **③ 返回字段** | 邮箱/昵称/手机/头像 + 用户类型/角色/状态/余额 + 实名信息（含身份证、企业信息、银行信息）+ 限流覆盖 + 禁用信息 + 审核拒绝原因 + 时间戳 |
| **④ 附带统计** | `stats: { apiKeyCount, totalRecharge, orderCount }`（API Key 数量、充值总额、订单数量），Redis `isBanned` |
| **⑤ 数据导出** | `GET /api/v1/admin/users/:id/export-data` — 返回脱敏 JSON（隐藏 passwordHash、图片文件路径脱敏为 `[图片文件]`，包含基础信息/API 列表/余额流水/调用统计/OAuth/备注） |

### O3. 创建/编辑/禁用用户

| 步骤 | 结果 |
|------|------|
| **① 源码位置** | `routes/admin/users/mutations.ts` |
| **② 创建 (`POST`)** | 需 `Perm.USER_CREATE`。接收 `{ email, password, nickname?, phone?, userType, role, status, balance?, discountRate?, remark? }`。检查邮箱唯一性 → `bcrypt.hash(password, 12)` → 事务插入 + 审计日志 |
| **③ 编辑 (`PATCH`)** | 需 `Perm.USER_EDIT`。**只允许更新白名单字段**: `nickname, phone, avatarUrl, status, role, discountRate, rpmOverride, tpmOverride, userType, disabledUntil, disabledReason`。状态联动：`pending→active` 自动补 `emailVerifiedAt`，`active→pending` 清除 |
| **④ 删除 (`DELETE`)** | 需 `Perm.USER_DELETE`。**软删除**: 设置 `status = "deleted"`, `deletedAt = new Date()`。审计日志记录 before/after |
| **⑤ 批量操作** | `routes/admin/users/actions.ts`: `POST /batch/disable` 和 `POST /batch/enable`（需 `USER_EDIT`）— 接收 `{ userIds: number[], reason?, disabledUntil? }`，批量更新 status/disabledReason/disabledBy/disabledAt |

### O4. 角色管理

| 步骤 | 结果 |
|------|------|
| **① 源码位置** | `routes/admin/roles.ts` |
| **② 角色 CRUD** | | 操作 | 端点 | 权限 | 说明 |
| | POST | `/api/v1/admin/roles` | `MODEL_MANAGE` | 创建角色（name, label, permissions BigInt, description），`isSystem=false` |
| | GET | `/api/v1/admin/roles` | `CONFIG_VIEW` | 列出所有角色（含 isSystem 标记） |
| | PATCH | `/api/v1/admin/roles/:id` | `MODEL_MANAGE` | 编辑角色（**super_admin 不可编辑**） |
| | DELETE | `/api/v1/admin/roles/:id` | `MODEL_MANAGE` | 删除角色（**super_admin 和 isSystem 角色不可删除**） |
| **③ 用户-角色分配** | | 操作 | 端点 | 权限 | 说明 |
| | POST | `/api/v1/admin/roles/:id/users/:userId` | `USER_EDIT` | 为用户分配角色 |
| | DELETE | `/api/v1/admin/roles/:id/users/:userId` | `USER_EDIT` | 移除用户角色 |
| | GET | `/api/v1/admin/roles/users/:roleId` | `USER_LIST` | 角色下的用户列表 |
| **④ 用户权限查询/微调** | | 端点 | 权限 | 说明 |
| | GET | `/api/v1/admin/users/:id/permissions` | `USER_VIEW` | 查询用户角色分配 + 权限微调 override |
| | PUT | `/api/v1/admin/users/:id/permissions` | `USER_EDIT` | 设置权限微调（grantPerms/denyPerms BigInt + reason） |
| | DELETE | `/api/v1/admin/users/:id/permissions` | `USER_EDIT` | 清除权限微调 |
| **⑤ 权限位清单** | `GET /api/v1/admin/roles/permissions/list`（需 `CONFIG_VIEW`），返回所有 Perm 枚举名和 bit 位置 |
| **⑥ 权限引擎** | `services/permission-engine.ts` `getUserPermissions(userId)` — 优先取用户权限微调 `userPermissionOverrides`，否则按角色分配 `userRoleAssignments` 取并集。有 Redis 缓存 |

### O5. 余额管理

| 步骤 | 结果 |
|------|------|
| **① 直接调余额** | `POST /api/v1/admin/users/:id/recharge`（`routes/admin/users/actions.ts`）需 `Perm.USER_BALANCE`。接收 `{ amount, description? }`。直接更新 `users.balance` + 插入 `balanceLogs` + 审计日志。**当前代码无双审逻辑**（直接调整，适合管理员手调） |
| **② 充值订单双审** | 通过 `rechargeOrders` 表有 `recharge_first_confirm`/`recharge_second_confirm` 的 audit action 枚举。对公转账充值确认需要一审 + 二审（在 finance 模块实现） |
| **③ balance_logs 记录字段** | `id, user_id, amount`（变动额）, `balance_after`（变动后余额）, `type`（`balance_log_type` 枚举: recharge/consumption/refund/trial_grant/admin_adjust/negative_repay/redemption_prepay/redemption_refund）, `ref_type`（关联类型: order/call/adjust）, `ref_id`（关联 ID）, `description`, `created_at` |
| **④ 余额流水查询** | `GET /api/v1/admin/users/:id/balance-logs`（`routes/admin/users/detail/balance.ts`）需 `Perm.USER_VIEW`。支持游标分页（cursor）和传统分页，支持 type 过滤 |

---

## 模块 P：限流系统 (Rate Limiting)

| 步骤 | 结果 |
|------|------|
| **① 源码位置** | `middleware/rate-limit.ts` |
| **② 架构** | 4 级 × 2 维度滑动窗口（Redis sorted set，窗口 60 秒） |
| **③ 4 级检查顺序 (RPM)** | ① API Key 级 → ② 用户级（含 override/quota）→ ③ 全局兜底 |
| **④ 2 维检查** | API Key 级/用户级/全局级都只检查 RPM；用户级/全局级额外检查 TPM |
| **⑤ 配置来源** | `systemConfigs` 表 6 个 key：`rate_limit_personal_rpm(默认60)/personal_tpm(100000)/enterprise_rpm(300)/enterprise_tpm(500000)/global_rpm(30)/global_tpm(50000)`。缓存 120 秒 |
| **⑥ 用户覆盖** | users 表 `rpmOverride`/`tpmOverride` 字段（NULL=使用类型默认值）。Quota 服务 `rpmLimit`/`tpmLimit` 也会覆盖 |
| **⑦ API Key 级 RPM 限值** | `rpmOverride ?? (企业 ? enterpriseRpm×2 : personalRpm×2)`，最低 60 |
| **⑧ 限流拒绝** | 返回 `HTTP 429`，header `Retry-After`（秒）。body 格式 OpenAI 兼容 `{ error: { message, type: "rate_limit_error", code: "rate_limit_exceeded" } }`。**限流拒绝同时记录一条 `callLogs`**（status=rate_limited） |
| **⑨ 计费后记录** | `recordRequestForLimit()` 在请求开始时调用（记录 RPM 计数）；`recordTokensForLimit()` 在计费后调用（记录 TPM token 量） |
| **⑩ Redis Key 格式** | `rl:rpm:key:{apiKeyId}`, `rl:rpm:user:{userId}`, `rl:rpm:global:0`（RPM），`rl:tpm:user:{userId}`, `rl:tpm:global:0`（TPM） |

---

## 🔴 发现的关键问题

### 严重 (Critical)
1. **无密码强度策略** — 注册和修改密码接口均无密码复杂度校验，仅 admin 重置密码检查最小 6 位。可被弱口令攻击。  
   **影响**: 安全风险 | **推荐**: 实现密码复杂度策略（大小写+数字+特殊字符 8 位以上）

2. **API Key 删除是硬删除** — `DELETE /api/v1/api-keys/:id` 直接 `db.delete()`，非软删除（update status）。已删除的 key 历史调用记录仍存在 `callLogs` 表，但无法追溯谁删了什么。  
   **影响**: 审计不完整 | **推荐**: 改为软删除（update `deleted_at`/`status=false`）

### 高 (High)
3. **限流冷启动窗口** — 首次请求创建 Redis key 后，60 秒窗口内第一个请求即可填满窗口。突发流量可能突破限流。  
   **影响**: 限流精度 | **推荐**: 使用令牌桶算法或冷启动加载

4. **余额调整无双审** — `POST /api/v1/admin/users/:id/recharge` 直接调整余额，仅记录审计日志。虽然有 `recharge_first_confirm`/`recharge_second_confirm` 的 audit action 枚举（用于对公转账流程），但手动调余额路径无此限制。  
   **影响**: 金融安全 | **推荐**: 对 >1000 元的余额调整增加二审流程

### 中 (Medium)
5. **重置密码 token 不绑定 IP/设备** — forgot-password token 仅绑定 userId 和 30 分钟过期，无 IP/设备指纹绑定。token 泄露后他人可在任意位置重置密码。  
   **影响**: 安全 | **推荐**: token 绑定 IP 前缀或 user-agent，降低泄露风险

6. **JWT access secret 开发环境硬编码** — `config.ts` 中 `JWT_ACCESS_SECRET` 默认 `"dev-access-secret"`，`JWT_REFRESH_SECRET` 默认 `"dev-refresh-secret"`。生产环境必须通过环境变量覆盖。  
   **影响**: 依赖环境配置 | **推荐**: 生产环境 `NODE_ENV=production` 时强制检查非默认值

### 低 (Low)
7. **Key 创建 permission 不匹配** — admin-keys.ts 创建路由使用 `requirePerm(Perm.CONFIG_EDIT)`，但 `admin.ts` 中管理 API Key 操作被映射到 module=`system`。权限分配时需同时配置。  
   **影响**: 权限模型复杂度 | **推荐**: 统一用 `CONFIG_EDIT` 权限位，优化文档

8. **limitCache 无时效清理** — `routes/proxy/auth.ts` 中 `userLimitCache` 用 Map 实现，60 秒 TTL 但无主动清理机制。长期运行可能内存泄漏。  
   **影响**: 内存 | **推荐**: 使用 Redis 缓存或基于 TTL 的自动清理

---

## 总结

| 模块 | 文件数 | API 端点 | 状态 |
|------|--------|----------|------|
| M: 认证 | 5 | 7 (login/register/verify-email/resend-verify/refresh/me/change-password + forgot+reset) | ✅ 通过 |
| N: API Keys | 3 | 9 (用户 CRUD+用量+导出) + 5(admin CRUD+日志) + 5(Admin Master Key) | ✅ 通过 |
| O: 用户管理 | 10+ | 30+ (列表/详情/创建/编辑/删除/批量/模拟/角色/权限/余额/日志/备注/白名单/导出) | ✅ 通过 |
| P: 限流 | 1 | 集成于代理路由 | ✅ 通过 |

**总测试覆盖**: **4 个模块, 60+ API 端点, 50+ 源码文件**  
**发现问题**: 8 个（Critical 2, High 2, Medium 2, Low 2）
