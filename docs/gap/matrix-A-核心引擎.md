# 差距矩阵 A：核心引擎与网关（§5 / §7 / §16 / §32）

> 生成时间：2026-10-02
> 代码基线：git HEAD `91f62d3`
> 范围：api/src/routes/{anthropic,openai-compat,chat,responses,rerank,task-relay,ws,messages,health,public,suppliers,internal-assets}.ts + services/{pipeline,billing,rate-limit,upstream,config}
> 权威源：代码实际行为（旧 PRD 中"已部署"指已删除的旧生产服，不代表当前代码）
>
> 状态枚举：✅ 已实现 / 🟡 部分实现（括号注明缺什么）/ ❌ 未实现（代码中找不到）/ 📄 文档超前（代码有但文档未写或描述与代码不符）

---

## A. 代码实际端点清单

> 所有路由插件在 `api/src/app.ts` 中 `app.register(...)` 直接挂载，**无统一前缀**；表中路径即真实访问路径。
> `/api/v1/v1/*` 为 web-console Playground 内部别名（与外部 `/v1/*` 同一 handler）。

| 路由文件 | 方法 | 路径 | 功能 | 对应章节 |
|---|---|---|---|---|
| chat.ts | POST | /v1/chat/completions | OpenAI Chat Completions 网关（pipeline 8 步） | §5.1/5.2 |
| chat.ts | POST | /api/v1/v1/chat/completions | Playground 别名 | §5.1 |
| openai-compat.ts | POST | /v1/embeddings | Embeddings 网关 | §5.1 |
| openai-compat.ts | POST | /v1/completions | 文本补全网关（legacy completions） | §5.1 |
| openai-compat.ts | GET | /v1/models | 已购模型列表（API Key 鉴权） | §5.1 |
| openai-compat.ts | POST | /api/v1/v1/embeddings、/v1/completions | Playground 别名 | §5.1 |
| anthropic.ts | POST | /anthropic/v1/messages | Anthropic 原生域名 Messages 网关 | §5.1/§7 |
| anthropic.ts | GET | /anthropic/v1/models | Anthropic 原生域名模型列表 | §5.1 |
| messages.ts | POST | /v1/messages | Anthropic 格式 Messages 网关（OpenAI 风格路径，claude-adapter 转换） | §5.1/§7 |
| messages.ts | POST | /api/v1/v1/messages | Playground 别名 | §5.1 |
| responses.ts | POST | /v1/responses | OpenAI Responses API 网关（responses-adapter/stream 转换） | §5.1 |
| responses.ts | POST | /api/v1/v1/responses | Playground 别名 | §5.1 |
| rerank.ts | POST | /v1/rerank | Cohere 兼容重排序网关 | §5.1 |
| rerank.ts | POST | /api/v1/v1/rerank | Playground 别名 | §5.1 |
| task-relay.ts | POST | /v1/mj/submit/:action | Midjourney 提交任务（imagine/describe/blend/...） | §5.1 |
| task-relay.ts | POST | /v1/suno/submit/:action | Suno 提交任务（MUSIC/LYRICS） | §5.1 |
| task-relay.ts | GET | /v1/mj/task/:id/fetch | MJ 任务状态（本地 DB） | §5.1 |
| task-relay.ts | GET | /v1/suno/fetch/:id | Suno 单任务状态（本地 DB） | §5.1 |
| task-relay.ts | POST | /v1/suno/fetch | Suno 批量任务状态（本地 DB） | §5.1 |
| task-relay.ts | POST | /api/v1/v1/{mj,suno}/* | Playground 别名 | §5.1 |
| ws.ts | GET | /v1/ws | WebSocket 流式转发（?api_key= 鉴权，首条消息 OpenAI 格式） | §5.1 |
| health.ts | GET | /health、/api/v1/health | 健康检查（网关 + PostgreSQL SELECT 1 + Redis PING） | §7 |
| internal-assets.ts | GET | /internal/assets/:name | 多模态临时文件内网下载（UUID.ext，防路径穿越） | §5.1 |
| public.ts | GET | /api/v1/public/site-config | 站点品牌配置（12 个 site_* 白名单） | §6/§16 |
| public.ts | GET | /api/v1/public/api-config | API 域名/接入配置（buildApiConfig） | §7 |
| public.ts | GET | /api/v1/public/models | 公开模型目录（active 销售定价 join） | §5.1 |
| public.ts | GET | /api/v1/public/models/health | 模型健康度/延迟（p50/p99 直方图） | §5.4 |
| public.ts | GET | /api/v1/public/status | 平台 + 供应商状态 | §7 |
| public.ts | GET | /api/v1/public/i18n/entries | Portal i18n 词典 | §6 |
| public.ts | GET | /api/v1/public/blog、/blog/:slug | 公开博客列表/详情 | §6 |
| public.ts | GET | /api/v1/models/:name/channels | 模型可用渠道列表 | §5.1 |
| public.ts | GET | /api/v1/models/:name/codes | 模型可用 modelCode 列表 | §5.1 |
| suppliers.ts | GET | /api/v1/admin/suppliers[/:id] | 供应商列表/详情（adminAuth） | §5.1 |
| suppliers.ts | POST/PUT/DELETE | /api/v1/admin/suppliers[/:id] | 供应商增改删 | §5.1 |
| suppliers.ts | GET/POST | /api/v1/admin/suppliers/:id/models | 供应商模型映射列表/新增 | §5.1 |
| suppliers.ts | PUT | /api/v1/admin/models/:id | 改模型映射 | §5.1 |
| suppliers.ts | PATCH | /api/v1/admin/models/:id/status | 模型上下架 | §5.1 |
| suppliers.ts | POST | /api/v1/admin/suppliers/:id/models/batch-status | 批量上下架 | §5.1 |
| suppliers.ts | GET/POST | /api/v1/admin/suppliers/:id/keys | 渠道 Key 列表/新增 | §5.1 |
| suppliers.ts | PUT/DELETE | /api/v1/admin/keys/:id | Key 改/删 | §5.1 |
| suppliers.ts | POST | /api/v1/admin/suppliers/:id/test | 渠道连通性测试 | §5.1 |
| suppliers.ts | GET | /api/v1/admin/suppliers/:id/balance | 供应商余额查询 | §5.1 |
| suppliers.ts | GET/POST/PUT | /api/v1/admin/pricing[/:id] | 销售定价管理（requirePerm supplier.pricing） | §5.2 |
| suppliers.ts | GET | /api/v1/public/pricing | 公开价格表 | §5.2 |
| suppliers.ts | GET | /api/v1/public/stats | 平台公开统计 | §6 |
| oauth.ts（旁证） | GET | /api/v1/auth/oauth/github/url、/github/callback | GitHub OAuth 登录（C 端） | §32 |
| oauth.ts（旁证） | GET/POST | /api/v1/auth/oauth/bindings、/:provider/{bind,unbind} | OAuth 绑定管理 | §32 |

> **网关主链路**（chat/messages/responses/rerank 共用，见 chat.ts:1-21 头注）：
> `auth(preHandler apiKeyAuth) → idempotency → rate-limit(preHandler) → validate → pre-consume(Redis Lua 冻结) → route(selectChannel) → proxy(单次上游 fetch) → settle(多退少补)`，由 `services/pipeline/executor.ts` Saga 补偿执行（失败反向 rollback）。

---

## B. 功能点差距矩阵

### B.1 §5.1 智能路由

| 编号 | 功能点 | 代码位置（证据） | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| R-01 | API Key 鉴权（存在/启用/过期） | services/auth/apikey.ts apiKeyAuth | SPEC §5.1 链路① | ✅ | preHandler 强制执行 |
| R-02 | IP 黑名单网关拦截 | app.ts:159-173 onRequest hook + services/security/ip-blacklist.ts | SPEC §5.1 链路② | ✅ | api/admin 双 scope，命中 403 |
| R-03 | 模型编码解析与校验 | upstream/routing.ts assertModelCodeAvailable:125、validateModelCode:207 | SPEC §5.1 链路④ | ✅ | 不存在/含@→404，分组排除→403 |
| R-04 | 分组供给过滤（allowedGroups） | upstream/routing.ts channelServesGroups:93、selectChannel:234-239 | SPEC §5.1 | ✅ | 用户分组 → 可见模型过滤 |
| R-05 | 渠道选择按 priority 排序 | upstream/routing.ts:250-266（orderBy desc priority） | SPEC §5.1 链路⑥ | ✅ | 仅按 priority |
| R-06 | 预扣（余额≤阈值 Redis Lua 冻结） | services/billing/pre-consume.ts + pipeline/steps/pre-consume.ts | SPEC §5.1 链路⑤/§5.2 | ✅ | 余额>阈值旁路，失败 rollback 解冻 |
| R-07 | 幂等（Idempotency-Key） | services/idempotency.ts + pipeline/steps/idempotency.ts | SPEC §5.1 | ✅ | 冲突回放首次结果，失败释放锁 |
| R-08 | **权重轮询负载均衡** | —（routing.ts 无 weight 字段读取/随机） | SPEC §5.1「负载均衡算法 P2」:82 | ❌ | 无 weight 轮询；supplierKeys 表虽查 selectMode 但 selectChannel 未使用 |
| R-09 | **最少连接 / 最低延迟 / 成本优先策略** | — | SPEC §5.1:83-85 | ❌ | 三种策略均未实现；无活跃连接计数、无按延迟选路、无成本比价 |
| R-10 | **故障转移（当前渠道失败→自动切下一渠道/Key）** | upstream/proxy.ts + pipeline/steps/proxy.ts:98（单次 fetch，失败即 throw UpstreamPassthroughError） | SPEC §5.1:86「故障转移」 | ❌ | **关键缺口**：选中 key 临时 5xx 未开熔断时直接透传给用户，不回退到同 supplier 下一 priority key；且一个 modelCode 只映射单 supplier，无跨供应商切换 |
| R-11 | **手动强制指定渠道（紧急切换）** | — | SPEC §5.1:59 | ❌ | 无 force_channel / 路由覆盖字段与逻辑 |
| R-12 | **路由推荐（基于历史价格/延迟/成功率）** | — | SPEC §5.1:60 | ❌ | 未实现 |
| R-13 | 决策树可视化后台 | — | SPEC §5.1:57 | ❌ | 无链路决策数据接口（前端属其他分片） |
| R-14 | 熔断器三态状态机 | upstream/circuit-breaker.ts active/open/half_open | SPEC §5.1:94-103 | 🟡 | 状态机正确，但**参数与存储与 SPEC 不符**（见 R-15） |
| R-15 | 熔断参数：窗口1min/超时30s/半开3探/记 security_events | circuit-breaker.ts:27-30（窗口 300000ms=5min、COOLDOWN 60000ms=60s、半开仅放行 1 个）；存 circuit_breaker_state 表 | SPEC §5.1:107-110 | 🟡 | 窗口 5min≠1min、冷却 60s≠30s、半开 1 探≠3 探；熔断事件写 circuit_breaker_state 而非 security_events |
| R-16 | 多协议适配（OpenAI/Anthropic/Responses/Cohere/MJ/Suno） | anthropic.ts、messages.ts(claude-adapter)、responses.ts(responses-adapter/stream)、rerank.ts、task-relay.ts | SPEC §7 兼容性 | ✅ | 6 类端点全覆盖 |
| R-17 | 多模态请求预处理落盘 + 内网拉取 | upstream/body-preprocessor.ts、temp-asset-store.ts、internal-assets.ts | SPEC §5.1 | ✅ | >1MB base64 落临时盘，/internal/assets/:name 供内网上游拉取 |
| R-18 | WebSocket 流式网关 | ws.ts + upstream/ws-relay.ts（37KB） | SPEC §16.1 WebSocket | ✅ | ?api_key= 鉴权，方案 A/B + 结算 |
| R-19 | MJ/Suno 任务落库 + 后台轮询 + 失败退款 | task-relay.ts + services/task/task-poller.ts（app.ts:308 注册） | SPEC §5.1 | ✅ | 1 任务≡1000 output token 固定价，超时自动退款冲销佣金 |

### B.2 §5.2 计费与结算

| 编号 | 功能点 | 代码位置（证据） | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| B-01 | 分层定价 L5活动→L4分组→L3代理→L2模型覆盖→L1兜底 | services/billing/pricing.ts:14-20（层级注释）、getPricingForModel | SPEC §5.2:123-132 | ✅ | 5 级优先级匹配 |
| B-02 | L0 渠道成本价 / L1 全局加价率（成本×(1+加价率)） | —（pricing.ts 直接读 vendor_pricing 售价，无成本价推导） | SPEC §5.2:125-126 | 🟡 | 未见 vendor_models 成本价与全局加价率字段；定价直接配售价，成本核算走另一套（finance） |
| B-03 | 预扣→多退少补 | billing/pre-consume.ts + settle.ts（settleBilling） | SPEC §5.2:137-141 | ✅ | Redis 冻结 + PG 镜像，settle 差额调整 |
| B-04 | 缓存命中折扣计费 | billing/cache-billing.ts（computeUsageCost/computeStreamCost）、pricing.ts ModelPricing.cacheDiscountRate/cacheReadInputPrice/cacheWriteInputPrice | SPEC §5.2.1:144-151 | ✅ | 模型级/全局/兜底三级折扣 + 显式读写缓存价 |
| B-05 | 三种上游缓存字段解析 | billing/usage-parser.ts parseCacheTokens（DeepSeek/Anthropic/OpenAI） | SPEC §5.2.1:150 | ✅ | D-11/D-14 归一化 |
| B-06 | 流式缓存计费 | upstream/proxy.ts:147-156 streamRelay 已解析 cacheHitTokens | SPEC §5.2.1:152「流式沿用全价」 | 📄 | 代码流式已透传缓存字段，与文档"流式全价"注释不一致——疑文档滞后，需 settle-stream 复核是否真正应用缓存价 |
| B-07 | 代理商折扣价（L3） | pricing.ts AGENT_LEVEL_DISCOUNT_RATE:55 | SPEC §5.2:128 | ✅ | 代理等级折扣率表 |
| B-08 | 活动价（L5） | pricing.ts parseCampaignPricing:207、queryCampaignPricing:356 | SPEC §5.2:130 | ✅ | 活动规则解析 |
| B-09 | 月度账单 PDF / 渠道结算单 / 自动对账 | （admin-invoices/admin-reconciliation/admin-vendor-settlements，属其他分片） | SPEC §5.2:155-157 | 🟡 | 端点存在但不属本分片核心引擎，未在本次精读范围 |
| B-10 | 智能定价建议（P2） | — | SPEC §5.2:159-161 | ❌ | 未实现 |
| B-11 | 任务型 API 固定单价 | task-relay.ts:23-31（1 任务≡1000 output token） | SPEC §5.1 | ✅ | MJ/Suno 按 action 映射模型名取价 |

### B.3 §5.3 限流引擎

| 编号 | 功能点 | 代码位置（证据） | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| L-01 | L1 全局限流 | app.ts:131 @fastify/rate-limit max=600/min | SPEC §5.3:192（目标 10000 QPS/6000万 TPM） | 🟡 | 口径不一致：代码 600/min 兜底，非 SPEC 的万级 QPS 硬顶 |
| L-02 | L2 用户级 QPS/TPM | rate-limit/enforcer.ts:7-8（user_groups.rate_limit_qps/tpm） | SPEC §5.3:193 | ✅ | 按 userId 计数 |
| L-03 | L3 **Key 级** QPS/TPM/日额度（用户可调） | —（enforcer 注释明说 Key 维度由 fastify 插件按 keyHash 60/min 兜底，无可配 TPM/日额度） | SPEC §5.3:194（Key QPS 50/TPM 300000） | ❌ | 缺独立 Key 级 TPM/日额度维度；fastify 60/min 仅为固定 QPS |
| L-04 | L4 模型硬顶 | rate-limit/enforcer.ts:8（model_rate_limits cap_rpm/cap_tpm） | SPEC §5.3:195 | ✅ | 按 userId+model |
| L-05 | 客户例外规则 | rate-limit/enforcer.ts:9（quota_exception_rules） | SPEC §5.3 | ✅ | 生效值=min(例外??组默认??平台默认, 模型硬顶) |
| L-06 | Redis 固定窗口 + fail-open 降级 | rate-limit/enforcer.ts:16-22 | SPEC §5.3 | ✅ | Redis 故障静默放行，DB 失败视为空 |
| L-07 | 429 响应携带 limit_type/limit_value/current_value/retry_after | rate-limit/enforcer.ts（RateLimitError） | SPEC §5.3:199-210 | 🟡 | 错误结构待逐字段复核是否全含 5 个字段 |
| L-08 | 限流可视化看板（命中率 Top、在线调整实时生效） | — | SPEC §5.3:212-215 | ❌ | 无限流命中率统计/排行接口 |

### B.4 §5.4 通知与告警

| 编号 | 功能点 | 代码位置（证据） | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| A-01 | **7 项告警指标检测引擎**（API失败率>5%/渠道可用率<95%/P95>2s/平台余额<¥100/用户失败率>20%/磁盘>85%/CPU>80%） | —（db/schema 无 monitoring_rules/monitoring_alerts 表；services 无告警定时检测） | SPEC §5.4:241-249、ref-5.4-alert-rules.md | ❌ | **ref-5.4 已完整设计 4 表+API，但零落地**；仅有模型健康聚合（marketplace/model-health-aggregator，p50/p99 延迟直方图用于看板，非告警） |
| A-02 | 告警历史 / 近 7 天命中趋势看板 | — | SPEC §5.4:262-263 | ❌ | 无 notification_history 表 |
| A-03 | 告警规则后台配置页（阈值/等级/启停） | — | SPEC §5.4:236-237 | ❌ | 无 CRUD 接口 |
| A-04 | 站内通知 | services/notify.ts + announcements | SPEC §5.4:268 | ✅ | 基础设施在，但无告警事件源接入 |
| A-05 | 邮件通知 | services/mailer.ts | SPEC §5.4:269 | ✅ | SMTP 异步队列在 |
| A-06 | WebSocket 实时推送 | ws.ts | SPEC §5.4:270 | ✅ | 通道在，但无告警事件推送 |
| A-07 | 余额告警通知（用户级） | routes/admin-consumption.ts:536 balance-alerts/:userId/notify | SPEC §5.4（部分） | 🟡 | 仅用户余额提醒，非 §5.4 的 7 项平台运维告警 |

### B.5 §7 非功能需求

| 编号 | 功能点 | 代码位置（证据） | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| N-01 | OpenAI + Anthropic 双格式独立可配域名 | services/config/api-domain.ts buildApiConfig | SPEC §7:50 | ✅ | 2026-08-17 定稿方案 |
| N-02 | API Key bcrypt hash | services/auth/apikey.ts | SPEC §7:46 | ✅ | |
| N-03 | IP 黑白名单 | services/security/ip-blacklist.ts | SPEC §7:46 | ✅ | 黑名单 onRequest 拦截 |
| N-04 | 2FA（TOTP） | routes/2fa.ts + services/auth/totp.ts | SPEC §7:46 | ✅ | otpauth:// 链接 |
| N-05 | 请求链路 request-id + 慢查询日志 | app.ts:149-151、lib/gateway-log.ts | SPEC §7 | ✅ | x-request-id 全链路透传 |
| N-06 | 数据合规（脱敏/留痕保留策略） | services/audit/retention.ts（app.ts:304 注册调度器） | SPEC §7:54 | ✅ | 对话留痕按策略清理 |
| N-07 | 性能 P95 目标（查询/列表/聚合/搜索） | — | SPEC §7:34-42 | ✅ | 文档自述已达标（NFR 声明，非代码功能点） |

### B.6 §16 第三方集成

| 编号 | 功能点 | 代码位置（证据） | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| T-01 | 支付网关配置（微信/支付宝/QQ/银行） | routes/admin-payment.ts（wechat/alipay/qq/bank 四组 + 证书上传） | SPEC §16.2 | ✅ | 配置与回调在（recharge/webhooks 分片） |
| T-02 | SMTP 邮件 | services/mailer.ts | SPEC §16.1 | ✅ | |
| T-03 | WebSocket 实时推送 | routes/ws.ts | SPEC §16.1 | ✅ | |
| T-04 | IP 地理库（归属地解析） | —（SPEC 标✅已完成，本分片未检索到地理库调用） | SPEC §16.1:42 | 🟡 | 待 security 分片核实；本代码树未见 ip2region/geoip 调用 |
| T-05 | **短信服务（阿里云/腾讯云，验证码+告警）** | —（api/src 零 aliyun/tencentcloud/dysms/sendSms） | SPEC §16.3 | ❌ | 完全未实现；admin-permissions.ts:235 虽列 'sms' 渠道标签，但无实际发送 SDK |
| T-06 | **对象存储 OSS/S3（头像/合同/证书）** | —（零 S3Client/putObject/presigned） | SPEC §16.4 | ❌ | 完全未实现；多模态临时文件落本地盘（MULTIMODAL_TMP_DIR），非 OSS |
| T-07 | 电子签章（法大大/上上签） | — | SPEC §16.1:38（P1） | ❌ | 未实现 |
| T-08 | 企业微信/钉钉 Webhook 报表推送 | — | SPEC §16.1:41（P2） | ❌ | 未实现 |
| T-09 | 第三方 adapter 模式封装 | upstream/{claude-adapter,responses-adapter,body-preprocessor}.ts | SPEC §16.5:64 | 🟡 | 上游厂商适配有，第三方通知/短信/OSS adapter 无 |
| T-10 | 支付掉单定时重查 | services/task + recharge 分片 | SPEC §16.2:48 | 🟡 | 属支付分片，本分片未精读 |

### B.7 §32 第三方集成与 SSO

| 编号 | 功能点 | 代码位置（证据） | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| S-01 | **管理员级全局出站 Webhook（事件推企微/Slack/自研）** | —（routes/webhooks.ts 是**用户端入站** webhook 配置，非全局出站事件推送） | SPEC §32.1 | ❌ | 无平台级事件→外部 URL 投递引擎 |
| S-02 | **SSO 单点登录（OIDC/SAML 2.0/LDAP）** | —（db/schema 无 sso_config；无 GET/PUT /admin/settings/sso、无 GET /auth/sso/:provider） | SPEC §32.2:236-241 | ❌ | 完全未实现；登录仅邮箱密码 + GitHub OAuth |
| S-03 | **企业微信/钉钉/飞书扫码登录管理后台** | —（oauth.ts providers 仅 github 真正接入，wechat/telegram/google → OAuthNotImplementedError 501） | SPEC §32.3 | ❌ | 完全未实现 |
| S-04 | C 端第三方 OAuth（GitHub） | routes/oauth.ts（/auth/oauth/github/url+callback、bindings/bind/unbind） | SPEC §32（部分） | 🟡 | GitHub 已接；wechat/telegram/google 占位 501（services/auth/oauth.ts:569） |
| S-05 | SSO 角色 group 映射（Admin/Viewer） | — | SPEC §32.2:214-215 | ❌ | 随 SSO 整体未建 |

---

## C. 关键发现（按风险排序）

1. **【生产稳定性最高风险】缺请求级故障转移与重试。** `upstream/routing.ts:268-275` 仅按 priority 选**第一个未熔断 key**，`pipeline/steps/proxy.ts:98` 单次 `fetch` 失败即抛 `UpstreamPassthroughError` 透传给用户。同 supplier 多 key、跨供应商都**不自动回退**。SPEC §5.1:86 明确要求"故障转移：当前选择失败→自动切换下一渠道"。当首选 key 临时 5xx 但熔断器尚未达 30% 阈值（需 10 样本/5min）时，用户直接看到失败——这是网关高可用的核心缺口。

2. **负载均衡只有优先级，无任何智能策略。** SPEC §5.1 P2 设计的加权轮询、最少连接、最低延迟、成本优先 4 种策略**全部未实现**；`supplierKeys.selectMode` 字段被查出但 `selectChannel` 未消费。一个 modelCode 在 DB 中只映射单一 supplier，跨供应商容量冗余也未做。

3. **§5.4 告警中心是"纸面设计"。** `ref-5.4-alert-rules.md` 已完整设计 monitoring_rules / monitoring_alerts / notification_config / notification_history 四表与全部 API，但 `api/src/db` 中**零落地**（grep 无任何匹配）。7 项运维告警指标（失败率/可用率/P95/余额/磁盘/CPU）无检测引擎，现有"模型健康度"仅算延迟直方图供 Marketplace 展示，不等同告警。

4. **§32 SSO 与 §16 短信/OSS 整体空白。** 代码中无 OIDC/SAML/LDAP、无企微/钉钉/飞书扫码、无阿里云/腾讯云短信 SDK、无 OSS/S3 SDK（多模态临时文件落本地盘）。当前第三方登录仅 GitHub C 端 OAuth。admin-permissions.ts 虽把 sms/wechat 列为通知渠道标签，但无实际发送实现——属"渠道枚举占位"。

5. **熔断器参数与文档脱节。** 代码：窗口 5 分钟、冷却 60 秒、半开放行 1 个试探、存 `circuit_breaker_state` 表；SPEC §5.1:107-110：窗口 1 分钟、超时 30 秒、半开 3 个、事件记 `security_events`。状态机三态正确，但量化参数与落表位置均不一致，重写 PRD 时需以代码实际为准或补齐配置。

6. **【文档滞后待复核】流式缓存计费。** SPEC §5.2.1:152 注明"流式场景沿用全价计费"，但 `upstream/proxy.ts:147-156` 的 `streamRelay` 已对流式 chunk 解析 `cacheHitTokens`。代码疑似已超前于文档支持流式缓存计费，需复核 `billing/settle-stream.ts` 是否真正应用了缓存折扣价；若属实，PRD 应改写为"流式/非流式均支持缓存计费"。

---

> 本矩阵仅覆盖 §5/§7/§16/§32 代码实现侧。前端页面是否齐备（[?] 帮助、可视化看板）不在本分片后端精读范围，标注 ❌ 的"后台页面"项需 web-console 分片二次确认；支付/发票/对账等跨分片端点仅标注存在性，未深入。
