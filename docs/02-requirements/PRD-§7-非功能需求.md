# §7 非功能需求 — 浩寅云

> 代码基线：91f62d3 + Step4 | 重写日期：2026-10-03
> 本文档描述代码实际具备的安全/可用性/合规能力；旧 SPEC 中「已部署」指已删除的旧生产服，不代表当前代码。

## 功能清单

### 7.1 安全

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 7.1.1 | API Key bcrypt hash 落库 | `services/auth/apikey.ts` | ✅已实现 | 仅存 key_hash + key_prefix，明文一次性展示 |
| 7.1.2 | IP 黑白名单 | `services/security/ip-blacklist.ts` + `app.ts` onRequest | ✅已实现 | 黑名单 api/admin 双 scope 拦截 |
| 7.1.3 | TOTP 2FA | `routes/2fa.ts` + `services/auth/totp.ts` | ✅已实现 | otpauth:// 链接 + 备用码；登录走 `/auth/2fa/verify` |
| 7.1.4 | 敏感操作二次 2FA | `2fa.ts` `/auth/2fa/operation-verify` | ✅已实现 | 充值/退款/调账/提现审核接 requireOperation2fa |
| 7.1.5 | 权限 bitset 模型 | `middleware/auth.ts` requirePerm | ✅已实现 | 9 等级/10 资源/7 操作 |
| 7.1.6 | Key 细粒度访问控制（Step4） | `services/security/key-permissions.ts` | ✅已实现 | 模型黑白/IP/Referer/RPM/TPM/日 Token，详见 §2.3.3 |

### 7.2 可用性与可观测

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 7.2.1 | 健康检查 | `routes/health.ts` GET `/health`、`/api/v1/health` | ✅已实现 | 网关 + PostgreSQL SELECT 1 + Redis PING |
| 7.2.2 | 平台公开状态页 | `public.ts` GET `/public/status` | ✅已实现 | 基础设施+供应商+公告+统计 |
| 7.2.3 | 请求链路 request-id 透传 | `app.ts` + `lib/gateway-log.ts` | ✅已实现 | x-request-id 全链路 |
| 7.2.4 | 慢查询/系统日志 | `admin-ops.ts` `/admin/sys/logs` | ✅已实现 | |
| 7.2.5 | 请求级故障转移（Step4） | `pipeline/steps/proxy.ts` | ✅已实现 | 瞬时 5xx/429/网络错自动回退下一 key，详见 §5.1.7 |
| 7.2.6 | 熔断 fail-open | `rate-limit/enforcer.ts`、`billing/budget.ts` | ✅已实现 | Redis/DB 故障静默放行，不阻断主链路 |

### 7.3 域名与接入

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 7.3.1 | OpenAI + Anthropic 双格式独立可配域名 | `services/config/api-domain.ts` buildApiConfig | ✅已实现 | 后台「系统设置→API 服务」配 api_domain |
| 7.3.2 | 多协议端点 | chat/anthropic/messages/responses/rerank/task-relay | ✅已实现 | OpenAI 风格 + Anthropic 原生域名 |

### 7.4 合规与数据生命周期

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 7.4.1 | 对话留痕按策略清理 | `services/audit/retention.ts`（app.ts 注册调度） | ✅已实现 | retention 可手动/定时执行 |
| 7.4.2 | 账号注销（7 天冷静期→物理删除） | `routes/deletion.ts` | ✅已实现 | 路径 `/me/deletion/*` |
| 7.4.3 | 数据导出申请/审核/下载 | `routes/data-requests.ts`、`data-export-grants.ts` | ✅已实现 | |
| 7.4.4 | 隐私/条款同意留痕 | `me-gap.ts` `/me/consent/*` + admin consent policies/logs | ✅已实现 | |

## 关键架构说明

- **fail-open 原则**：限流、预算、熔断等防护组件在自身依赖（Redis/DB）故障时一律放行，优先保证主链路可用性，而非因防护组件故障导致全站不可用。
- **可观测性**：x-request-id 贯穿网关日志与 admin 系统日志；模型健康度 p50/p99 直方图由 model-health-aggregator 常驻计算。

## 未实现 / 规划中

| 功能点 | 状态 | 说明 |
|---|---|---|
| SSO 单点登录（OIDC/SAML 2.0/LDAP） | ❌未实现（规划中） | 无 sso_config；登录仅邮箱密码 + GitHub OAuth |
| 企微/钉钉/飞书扫码登录管理后台 | ❌未实现（规划中） | oauth providers 仅 github 真接入，wechat/telegram/google 占位 501 |
| 管理员级全局出站 Webhook（事件推企微/Slack） | ❌未实现（规划中） | 现有 admin/webhooks 为配置项，无平台事件→外部 URL 投递引擎 |
| 短信服务（阿里云/腾讯云，验证码+告警） | ❌未实现（规划中） | api/src 无短信 SDK（admin-permissions 仅列渠道标签） |
| 对象存储 OSS/S3（头像/合同/证书） | ❌未实现（规划中） | 多模态临时文件落本地盘 MULTIMODAL_TMP_DIR，非 OSS |
| 电子签章（法大大/上上签） | ❌未实现（规划中） | |
| 企微/钉钉 Webhook 报表推送 | ❌未实现（规划中） | |
| 后台访问白名单（区别于风控 IP 黑名单） | ❌未实现（规划中） | 现有为风控黑名单语义 |
| 后台操作水印 | ❌未实现（规划中） | |
| 性能 P95 量化探针（查询/列表/聚合/搜索） | ❌未实现（规划中） | 旧 SPEC 为 NFR 声明，无代码级 SLA 探针 |
