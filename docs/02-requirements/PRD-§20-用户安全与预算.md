# §20 用户端安全与预算增强

- 品牌：浩寅云
- 代码基线：git HEAD `91f62d3`（2026-10-03，含 Step 4）
- 权威源：`api/src/routes/{me-budget,2fa,deletion,apikeys,me-gap}.ts`、`api/src/services/auth/{apikey,totp}.ts`、migration 0042
- 状态图例：✅ 已实现 / 🟡 部分实现 / ❌ 未实现（规划中）

## 20.1 功能清单

| 编号 | 能力 | 代码落点 | 状态 | 差距说明 |
|---|---|---|---|---|
| 20.1.1 | 用户日/月消费预算设置 | `me-budget.ts`：`GET/PUT /api/v1/me/budget`；表 `user_budget_settings`（migration 0042） | ✅ | Step 4 已上线 |
| 20.1.2 | 网关 pre-consume 前预算熔断 | pipeline 预算中间件（预扣前执行） | ✅ | 超额即拒绝，不进入余额预扣 |
| 20.1.3 | 管理员预算总览/熔断历史/默认预算下发 | — | ❌ | 无 `/admin/budgets*` 端点 |
| 20.2.1 | TOTP 2FA 全流程 | `2fa.ts`：`/auth/2fa/{setup,enable,disable,verify,status}` | 🟡 | setup/enable/disable/verify/status 齐；缺恢复码重生成端点、管理员 2FA 策略配置、强制重置、2FA 日志 |
| 20.2.2 | 操作级二次 2FA（敏感操作） | `2fa.ts`：`POST /auth/2fa/operation-verify` + `middleware/require-operation-2fa.ts` | ✅ | 财务写操作（充值审核/退款/调账/锁账/结算确认）全部强制；错误码不用 401 防误登出 |
| 20.2.3 | 信任设备 | — | ❌ | 无 `session_trusted_devices` 表 |
| 20.3.1 | 设备管理（活跃会话列表/单台远程登出） | `me-gap.ts`：`GET /me/devices`、`POST /me/devices/:id/logout` | 🟡 | 列表+单台登出齐；缺一键登出全部、标记可信、riskLevel/riskRule 字段、UA 解析 deviceType |
| 20.4.1 | Key 模型白名单 | `api_keys.modelWhitelist` 列 + `services/groups.ts` 分组 modelWhitelist | ✅ | Step 4 已上线：创建/编辑 Key 时可配模型范围，网关校验 MODEL_NOT_ALLOWED |
| 20.4.2 | Key IP 白名单 | `api_keys.allowedIps`（`services/auth/apikey.ts:17,79`） | ✅ | Step 4 已上线：非白名单 IP 拦截 |
| 20.4.3 | Key Referer 白名单 | `api_keys.allowedReferers` | ✅ | Step 4 已上线 |
| 20.4.4 | Key 日 Token 上限 | `api_keys.dailyTokenLimit` | ✅ | Step 4 已上线，按日计数超限拒绝 |
| 20.4.5 | Key RPM/TPM 限流 | 限流引擎（`services/rate-limit/enforcer.ts` 用户组 L2 + 模型硬顶 L4） | 🟡 | 用户组级 QPS/TPM、模型级 cap_rpm/cap_tpm 已实现；**Key 独立 RPM/TPM 维度未配**（现仅 fastify 60/min 兜底） |
| 20.5.1 | 登录历史 | `me-gap.ts`：`GET /me/login-history` | 🟡 | 原始记录齐；缺风险色标、距离 KM 展示、"确认本人/这不是我"交互与 `confirm/report` 端点、`GET /me/security/summary` |

## 20.2 关键架构

- 预算闸串联：`apiKeyAuth → 预算熔断(user_budget_settings) → 幂等 → 限流 → pre-consume(余额 Lua 冻结)`。预算是用户级软限，余额是硬限（禁负，ADR-0020）。
- Key 细权限在 `apiKeyAuth` preHandler 内一次性校验（存在性/启用/过期/IP/Referer/模型范围/日 Token），失败返回统一 403 类错误码，不进入后续 pipeline。
- 2FA 登录第二步用 tempToken 机制：登录返回 tempToken → `/auth/2fa/verify` 换正式 JWT（路径以代码为准，非旧文档 `/auth/2fa/login`）。

## 20.3 未实现项

| 优先级 | 事项 |
|---|---|
| P1 | 管理员预算总览与默认预算下发 |
| P1 | Key 级独立 RPM/TPM 可配维度 |
| P1 | 登录异常前端增强（风险标签 + 确认本人/这不是我） |
| P2 | 恢复码重生成、管理员 2FA 策略、信任设备、一键登出全部 |
