# 测试计划 — 细粒子任务清单

> 生成时间: 2026-06-28 09:53 CST
> 项目: 3cloud (3C) AI Token 聚合平台
> 版本: V3.4

## 测试分组与状态

| 编号 | 任务名称 | 分组 | 输出文件 | 状态 |
|------|----------|------|----------|------|
| T1 | Auth 端点审计 | Group 1 | `auth-routes.md` | ✅ Done |
| T2 | API Keys 端点审计 | Group 1 | `api-keys-routes.md` | ✅ Done |
| T3 | Logs & Models 端点审计 | Group 1 | `logs-models-routes.md` | ✅ Done |
| T4 | Recharge 端点审计 | Group 1 | `recharge-routes.md` | ✅ Done |
| T5 | Team 端点审计 | Group 1 | `team-routes.md` | ✅ Done |
| T6 | Proxy & Agent 端点审计 | Group 1 | `proxy-agent-routes.md` | ✅ Done |
| T7 | Admin Users 端点审计 | Group 2 | `admin-users-routes.md` | ✅ Done |
| T8 | Admin Models 端点审计 | Group 2 | `admin-models-routes.md` | ✅ Done |
| T9 | Admin Vendors 端点审计 | Group 2 | `admin-vendors-routes.md` | ✅ Done |
| T10 | Admin Vendor-Models 端点审计 | Group 2 | `admin-vendor-models-routes.md` | ✅ Done |
| T11 | Admin Agents & Recharge 端点审计 | Group 2 | `admin-agents-recharge-routes.md` | ✅ Done |
| T12 | Admin System & Dashboard & Logs 端点审计 | Group 2 | `admin-system-dashboard-logs-routes.md` | ✅ Done |
| T13 | 前端路由一致性审计 | Group 3 | `frontend-route-audit.md` | ✅ Done |
| T14 | 前端页面组件完整性审计 | Group 3 | `frontend-page-audit.md` | ✅ Done |
| T15 | 前端构建检查 | Group 3 | `frontend-build-report.md` | ✅ Done |
| T16 | DB Schema & 种子数据审计 | Group 4 | `db-schema-audit.md` | ✅ Done |
| T17 | 中间件审计 | Group 4 | `middleware-audit.md` | ✅ Done |
| T18 | API 响应格式一致性检查 | Group 4 | `response-format-audit.md` | ✅ Done |

## T1 — Auth 路由审计

**文件:** `api/src/routes/auth.ts`
**端点:**
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/verify-email`
- `POST /api/v1/auth/resend-verify`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/change-password`

**检查项:**
1. Schemas: registerSchema, loginSchema, refreshSchema, changePasswordSchema
2. 错误处理: AppError, ZodError, 未捕获异常
3. 响应格式: `{code, data, message}`
4. JWT: authenticateJWT 中间件覆盖
5. 邮箱验证码流程完整性

## T2 — API Keys 路由审计

**文件:** `api/src/routes/api-keys.ts`
**端点:**
- `POST /api/v1/api-keys`
- `GET /api/v1/api-keys`
- `PATCH /api/v1/api-keys/:id`
- `DELETE /api/v1/api-keys/:id`

**检查项:**
1. SHA-256 哈希存储 (createHash + hex)
2. keyPrefix (rawKey.slice(0, 8))
3. 软删除 (实际物理删除)
4. 分页逻辑
5. 权限: 仅本人操作

## T3 — Logs & Models 路由审计

**文件:** `api/src/routes/logs.ts`, `api/src/routes/models.ts`
**端点:**
- `GET /api/v1/logs` — 分页调用日志
- `GET /api/v1/logs/:id` — 单条日志详情
- `GET /api/v1/logs/summary` — 用户统计
- `GET /api/v1/models` — 公开模型列表

**检查项:**
1. 分页参数解析
2. 时间范围筛选
3. Zod Schema: logFilterSchema
4. 公开访问 vs JWT 鉴权区分

## T4 — Recharge 路由审计

**文件:** `api/src/routes/recharge.ts`
**端点:**
- `POST /api/v1/recharge` — 在线支付下单
- `POST /api/v1/recharge/bank-transfer` — 对公转账
- `GET /api/v1/recharge/orders` — 订单列表
- `POST /api/v1/recharge/:id/cancel` — 取消订单
- `POST /api/v1/recharge/notify` — 支付回调

**检查项:**
1. DECIMAL(18,6) 字符串处理
2. 支付流程完整性
3. 回调签名验证 (TODO)
4. 订单状态管理
5. rechargeSchema, bankTransferSchema

## T5 — Team 路由审计

**文件:** `api/src/routes/team.ts`
**端点:**
- `POST /api/v1/team` — 创建
- `GET /api/v1/team` — 获取信息
- `POST /api/v1/team/invite` — 邀请成员
- `DELETE /api/v1/team/members/:userId` — 移除成员
- `PATCH /api/v1/team/members/:userId` — 更新成员
- `POST /api/v1/team/leave` — 退出团队

**检查项:**
1. 团队角色约束 (team_owner, team_admin, team_member)
2. 一人一队校验
3. 成员配额
4. Schema 校验: createTeamSchema, inviteTeamMemberSchema, updateTeamMemberSchema

## T6 — Proxy & Agent 路由审计

**文件:** `api/src/routes/proxy.ts`, `api/src/routes/agent.ts`
**端点:**
- `POST /api/v1/chat/completions` — 流式+非流式
- `POST /api/v1/embeddings` — 非流式
- `GET /api/v1/agent/dashboard` — 代理商面板
- `GET /api/v1/agent/clients` — 客户列表
- `GET /api/v1/agent/commissions` — 佣金历史
- `POST /api/v1/agent/withdraw` — 提现
- `GET /api/v1/agent/withdraws` — 提现记录

**检查项:**
1. 路由引擎调用链
2. 费率计算逻辑
3. 余额扣减
4. 代理分佣逻辑
5. 限流 (RPM/TPM)
6. SSE 流式处理

## T7 — Admin Users 路由审计

**文件:** `api/src/routes/admin/users.ts`
**端点:**
- `GET /api/v1/admin/users` — 用户列表
- `GET /api/v1/admin/users/:id` — 详情
- `PATCH /api/v1/admin/users/:id` — 更新
- `DELETE /api/v1/admin/users/:id` — 删除(软删除)
- `POST /api/v1/admin/users/:id/recharge` — 手动调余额
- `POST /api/v1/admin/users/:id/reset-pwd` — 重置密码
- `GET /api/v1/admin/real-name-review` — 实名审核列表
- `POST /api/v1/admin/real-name-review/:id` — 审核实名

**检查项:**
1. 管理员权限 (requireRole("super_admin", "admin"))
2. 审计日志 (auditLogs 表)
3. 字段白名单
4. 事务完整性 (db.transaction)
5. bcrypt 密码哈希 (SALT_ROUNDS = 12)

## T8 — Admin Models 路由审计

**文件:** `api/src/routes/admin/models.ts`
**检查项:**
1. MODEL_TYPES 常量约束
2. 关联检查 (vendorModels 引用)
3. 唯一键冲突处理 (23505)

## T9 — Admin Vendors 路由审计

**文件:** `api/src/routes/admin/vendors.ts`
**检查项:**
1. AES-256-GCM 加密 (vendor-models)
2. 关联检查 (vendorModels)
3. 字段白名单更新

## T10 — Admin Vendor-Models 路由审计

**文件:** `api/src/routes/admin/vendor-models.ts`
**检查项:**
1. encryptApiKey, decryptApiKey
2. 加密字段排除 (apiKeyEncrypted: _)
3. 定价逻辑
4. 健康状态管理

## T11 — Admin Agents & Recharge 路由审计

**文件:** `api/src/routes/admin/agents.ts`, `admin/recharge-admin.ts`
**检查项:**
1. 代理商创建/更新
2. 提现审核流程
3. 充值订单确认 (confirmBankTransfer)
4. 审计日志

## T12 — Admin System & Dashboard & Logs 路由审计

**文件:** `api/src/routes/admin/system.ts`, `admin/dashboard.ts`, `admin/logs.ts`
**检查项:**
1. 系统配置 CRUD
2. 审计日志查询
3. Dashboard 统计 (用户/调用/充值)
4. 管理员视角调用日志

## T13 — 前端路由一致性审计

**文件:** `web/src/App.tsx`, `docs/frontend-routes.md`
**检查项:**
- 实际路由 vs 规划路由差异
- 缺失路由识别

## T14 — 前端页面组件完整性

**文件:** `web/src/pages/**/*.tsx`
**检查项:**
- API 调用匹配
- UI 元素完整性
- 功能完整性

## T15 — 前端构建检查

**命令:** `npm run build`
**检查项:**
- TypeScript 类型错误
- Vite 构建错误

## T16 — DB Schema & 种子数据审计

**文件:** `api/src/db/schema.ts`, `api/src/db/seed.ts`
**检查项:**
- 17 张表定义
- 表 vs 路由引用
- 种子数据 23+3 条

## T17 — 中间件审计

**文件:** `api/src/middleware/auth.ts`, `rate-limit.ts`, `log.ts`
**检查项:**
- JWT 验证
- 角色权限
- 限流逻辑
- 审计日志

## T18 — API 响应格式一致性

**检查项:**
- `{code, data, message}` 包装
- AppError / ZodError 处理
- 统一性覆盖
