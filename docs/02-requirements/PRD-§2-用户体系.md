# §2 用户体系 — 浩寅云

> 代码基线：91f62d3 + Step4 | 重写日期：2026-10-03
> 本文档基于代码现状反向编写。路径一律以代码为准（如注销走 `/me/deletion/*`，不是旧 SPEC 的 `/account/deletion-request`）。

## 功能清单

### 2.1 认证与账户

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 2.1.1 | 邮箱+密码注册 | `routes/auth.ts` POST `/api/v1/auth/register` | ✅已实现 | |
| 2.1.2 | 邮箱密码登录（触发 2FA tempToken） | `auth.ts` POST `/auth/login` | ✅已实现 | 开启 2FA 时返回 tempToken 走第二步 |
| 2.1.3 | 登出 / 刷新 JWT / 当前用户 | `auth.ts` POST `/auth/logout`、`/auth/refresh`、`/auth/me`（别名 `/api/v1/me`） | ✅已实现 | |
| 2.1.4 | 忘记密码 / 重置密码 / 发送邮箱验证码 | `auth.ts` POST `/auth/forgot-password`、`/auth/reset-password`、`/auth/send-email-code` | ✅已实现 | |
| 2.1.5 | TOTP 2FA 完整流程 | `routes/2fa.ts` | ✅已实现 | setup/enable/disable/verify/status；登录二次验证走 **`/auth/2fa/verify`**（非旧 SPEC 的 `/auth/2fa/login`） |
| 2.1.6 | 敏感操作二次 2FA | `2fa.ts` POST `/auth/2fa/operation-verify` | ✅已实现 | 财务操作（充值审核/退款/调账）接 `requireOperation2fa` |
| 2.1.7 | 第三方 OAuth 登录 | `routes/oauth.ts` | 🟡部分实现 | **仅 GitHub** 真接入（url/callback/bindings/bind/unbind）；wechat/telegram/google 返回 501 占位 |
| 2.1.8 | 改密 / 改邮箱 | `routes/me.ts` `/me/change-password`、`/me/change-email` | ✅已实现 | |

### 2.2 个人中心与控制台

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 2.2.1 | 用户统计概览 | `me.ts` GET `/me/stats` | ✅已实现 | |
| 2.2.2 | 我的模型列表 / 单价查询 | `me.ts` GET `/me/models`、`/me/models/:id/price` | ✅已实现 | 前端无独立模型中心页，内嵌 Playground/Dashboard |
| 2.2.3 | 调用日志 | `me.ts` GET `/me/logs` | 🟡部分实现 | 列表/筛选在；缺 CSV 导出、请求/响应回放抽屉 |
| 2.2.4 | 用量统计 | `web-console` StatisticsPage + `/me/stats` | 🟡部分实现 | 日/周/月趋势+模型分布在；缺环比对比卡片 |
| 2.2.5 | 分组信息 / 分组可见模型 | `me.ts` GET `/me/group`、`/me/group/models` | ✅已实现 | |
| 2.2.6 | 默认模型偏好 | `me.ts` `/me/preferences/default-code` GET/PUT/DELETE | ✅已实现 | |
| 2.2.7 | 在线调试 Playground | `web-console` PlaygroundPage | ✅已实现 | 模型选择/参数/调用/结果展示；调用历史未持久化 |
| 2.2.8 | Onboarding 引导（5 步） | `routes/me-onboarding.ts` | ✅已实现 | status/step/skip/complete 端点齐全 |
| 2.2.9 | 通知中心 / 未读数 / 已读 | `me.ts` `/me/notifications*` + `me-gap.ts` `/me/announcements*` | ✅已实现 | 站内通知 + 公告两套，均含未读/单读/全读 |
| 2.2.10 | 通知偏好（分类+邮件渠道） | `me-gap.ts` `/me/notification-settings*`、`/me/preferences/notifications` | 🟡部分实现 | 分类开关在；缺安全告警强制差异化逻辑 |
| 2.2.11 | 设备会话管理 | `me-gap.ts` GET `/me/devices`、POST `/me/devices/:id/logout` | 🟡部分实现 | 列表+单台登出在；缺一键登出全部/标记可信/风险等级 |
| 2.2.12 | 登录历史 | `me-gap.ts` GET `/me/login-history` | 🟡部分实现 | 原始记录在；缺风险色标与「确认本人/这不是我」交互 |

### 2.3 API Key 管理

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 2.3.1 | Key CRUD（列表/创建/编辑/删除） | `routes/apikeys.ts` `/me/api-keys` | ✅已实现 | 创建一次性展示完整 Key；兼容别名 `/customers/me/keys` |
| 2.3.2 | 批量吊销全部 Key | `me.ts` POST `/me/api-keys/revoke-all` | ✅已实现 | 仅「吊销全部」，缺勾选子集批量操作 |
| 2.3.3 | **Key 细粒度权限**（Step4 新增） | `db/schema/api-keys.ts` 扩列 + `services/security/key-permissions.ts` | ✅已实现 | 见下 |
| 2.3.4 | Key 过期时间 | `api_keys.expires_at`（Step4 列） | ✅已实现 | 列已建；网关过期判定见 key-permissions |

**2.3.3 Key 细粒度权限明细（Step4，migration 0043）**：

| 能力 | 字段 | 拦截逻辑 |
|---|---|---|
| 模型白名单 | `allowed_models`（text[]） | 非空时仅允许列表内模型 |
| 模型黑名单 | `blocked_models`（text[]） | 列表内模型一律 403，**优先级高于白名单** |
| IP 白名单 | `allowed_ips`（text[]） | 非空时仅放行，支持 IPv4 单地址/CIDR |
| Referer 白名单 | `allowed_referers`（text[]） | 请求头 Referer 子串匹配 |
| 日 Token 上限 | `daily_token_limit`（int） | Key 维度 UTC 自然日计数 |
| RPM 上限 | `rpm_limit`（int） | Key 维度 60s 窗口请求数 |
| TPM 上限 | `tpm_limit`（int） | Key 维度 60s 窗口 Token 数 |

> 拦截器：`enforceKeyPermissionsPreHandler`（fastify preHandler），含 `checkModelAccess/checkIpAccess/checkRefererAccess`。所有数组列 nullable，NULL/空 = 不限制（向后兼容）。

### 2.4 充值 / 账单 / 发票

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 2.4.1 | 余额 / 发起充值 / 充值订单 / 记录 | `routes/recharge.ts` `/me/balance`、`/me/recharge`、`/me/recharge-orders`、`/me/recharge/records` | ✅已实现 | |
| 2.4.2 | 兑换码核销 / 兑换历史 | `recharge.ts` `/me/redemption/redeem`、`/me/redemption/history` | ✅已实现 | |
| 2.4.3 | 当前月账单 / 每日明细 / 历史账单 / 月账单下载 | `me.ts` `/me/billing/current[/daily]`、`/me/billing/history[/:month[/download]]` | ✅已实现 | |
| 2.4.4 | 可开票额度 / 申请发票 / 发票列表 / 下载 | `me.ts` `/me/invoices*` | ✅已实现 | |
| 2.4.5 | 充值送额度活动 | `recharge.ts` GET `/me/promotions` | 🟡部分实现 | 活动读取在；满赠规则配置归 admin campaigns |

### 2.5 用户预算熔断（Step4 新增）

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 2.5.1 | 查询预算设置 + 今日/本月已用量 | `routes/me-budget.ts` GET `/api/v1/me/budget` | ✅已实现 | 未设置记录返回默认值（不限额/告警80%/硬阻断开） |
| 2.5.2 | 设置日/月限额、告警阈值、硬阻断开关 | `me-budget.ts` PUT `/api/v1/me/budget` | ✅已实现 | 限额单位「分」；`alertThreshold` 1-100；`hardBlock` bool |
| 2.5.3 | 网关 pre-consume 前熔断判定 | `services/billing/budget.ts` `assertWithinBudget` + pipeline `budgetCheckStep` | ✅已实现 | 超限且 hardBlock → 429 `BudgetLimitExceededError`；达告警阈值放通但 warn；依赖故障 fail-open |

### 2.6 合规与数据

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 2.6.1 | 账号注销全生命周期 | `routes/deletion.ts` | ✅已实现 | 路径 **`/me/deletion/{checks,request,status,cancel}`** + 管理端 `/admin/deletion-requests/{approve,reject,execute}`；前置检查→申请→撤回→审核→7 天冷静期→物理删除 |
| 2.6.2 | 数据导出申请与下载 | `routes/data-requests.ts` | ✅已实现 | 用户申请→管理员审核→执行→下载；`/me/data-export/*` |
| 2.6.3 | 数据导出授权（管理员） | `routes/data-export-grants.ts` | ✅已实现 | `/admin/data-export-grants` |
| 2.6.4 | 隐私政策 / 服务条款同意 | `me-gap.ts` `/me/consent/{status,privacy,terms}` | ✅已实现 | |
| 2.6.5 | 实名认证 | `me.ts` `/me/real-name` GET/POST | ✅已实现 | 管理端审核见 §4 |

### 2.7 其他用户端能力

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 2.7.1 | Webhook 配置（CRUD+测试+重签 secret+启停） | `routes/webhooks.ts` + `me-gap.ts` PATCH | ✅已实现 | |
| 2.7.2 | 工单（提交/回复/关闭） | `me.ts` `/me/tickets*` | ✅已实现 | |
| 2.7.3 | 知识库浏览 / 反馈 | `me-gap.ts` `/me/knowledge-base*` | ✅已实现 | |
| 2.7.4 | MJ/Suno 任务查询 | `web-console` MjSunoTasksPage + task-relay | ✅已实现 | |
| 2.7.5 | 业务员 CRM（销售身份） | `routes/me-sales.ts` `/me/customers*`、`/me/follow-reminders*`、`/me/sales-performance` | ✅已实现 | 客户认领/打标签/跟进提醒/业绩，共 14 端点 |

## 关键架构说明

- **认证双轨**：控制台/个人中心走 JWT（`/api/v1/auth/*`）；网关推理走 API Key（`services/auth/apikey.ts`，key 以 bcrypt hash 落库）。
- **个人中心按历史补缺拆文件**：`me.ts`（54KB 主体）、`me-gap.ts`（31KB 补缺）、`me-onboarding.ts`、`me-sales.ts`（49KB 销售）、`me-budget.ts`、`me-agent.ts`。
- **预算/Key 权限均 fail-open**：预算检查与限流在 Redis/DB 异常时静默放行，不因自身故障阻断主链路。

## 未实现 / 规划中

| 功能点 | 状态 | 说明 |
|---|---|---|
| 官方 SDK（多语言） | ❌未实现（规划中） | 仅 API 协议兼容 OpenAI/Anthropic，无官方 SDK |
| 独立模型中心页 `/console/models` | ❌未实现（规划中） | 后端接口在，前端无独立页与筛选抽屉 |
| Key 操作日志（`key_permission_changes`） | ❌未实现（规划中） | Key 权限变更历史未记录 |
| 错误码自助排障页 | ❌未实现（规划中） | 无错误码检索页（Step4 Portal /docs 已含错误码表，见 §6） |
| 2FA 管理员策略 / 恢复码重生成 / 信任设备 | ❌未实现（规划中） | 用户侧 2FA 已闭环；`/admin/2fa/*`、recovery-codes 重生成、`session_trusted_devices` 未建 |
| 管理员预算列表/熔断历史 | ❌未实现（规划中） | 用户侧预算 ✅，管理员聚合视图未建 |
| 仪表盘活动流/成本预测/异常告警卡片 | ❌未实现（规划中） | DashboardPage 基础卡片在，增强区未做 |
