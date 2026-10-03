# §16 第三方集成

- 品牌：浩寅云
- 代码基线：git HEAD `91f62d3`（2026-10-03，含 Step 4 批次 1）
- 权威源：`api/src/routes/admin-payment.ts`、`api/src/services/mailer.ts`、`api/src/routes/ws.ts`、`api/src/upstream/*-adapter.ts`
- 状态图例：✅ 已实现 / 🟡 部分实现 / ❌ 未实现（规划中）

## 16.1 功能清单

| 编号 | 能力 | 代码落点 | 状态 | 说明 |
|---|---|---|---|---|
| 16.1.1 | 支付网关配置（微信/支付宝/QQ/对公银行） | `admin-payment.ts`：`GET/PUT /api/v1/admin/payment/config`、`GET /certs`、`POST /cert`、`DELETE /cert/:name` | ✅ | 四组渠道配置 + 证书上传/删除 |
| 16.1.2 | 支付回调与掉单补单 | recharge/webhooks 链路（见 §9 充值主题） | 🟡 | 回调在；掉单定时重查归支付分片，本主题不展开 |
| 16.1.3 | SMTP 邮件发送 | `services/mailer.ts`（SMTP 异步队列） | ✅ | 站内通知 + 邮件按偏好分发 |
| 16.1.4 | WebSocket 实时推送通道 | `routes/ws.ts`：`GET /v1/ws`（?api_key= 鉴权） | ✅ | **注意：该通道当前承载 LLM 流式推理中继**，非运维事件推送；通用通知 WS 复用此连接但无独立事件订阅模型 |
| 16.1.5 | 上游厂商协议适配 | `upstream/claude-adapter.ts`、`responses-adapter.ts`、`body-preprocessor.ts` | ✅ | OpenAI / Anthropic / Responses / Cohere / MJ / Suno 六类协议适配 |
| 16.1.6 | IP 地理归属地解析 | — | 🟡 | 代码树未见 ip2region/geoip 调用，SPEC 旧文档标"已完成"，以代码为准降级 |
| 16.1.7 | 短信服务（阿里云/腾讯云验证码+告警） | —（`api/src` 无 aliyun/tencentcloud/dysms 调用） | ❌ | `admin-permissions.ts` 仅列 'sms' 渠道标签占位，无实际发送 SDK；当前验证码走邮件 |
| 16.1.8 | 对象存储 OSS/S3（头像/合同/证书） | —（无 S3Client/putObject/presigned） | ❌ | 多模态临时文件落本地盘 `MULTIMODAL_TMP_DIR`（`internal-assets.ts` 内网下载），非 OSS |
| 16.1.9 | 电子签章（法大大/上上签） | — | ❌ | P1 规划，未接入 |
| 16.1.10 | 企微/钉钉 Webhook 报表外推 | — | ❌ | P2 规划 |
| 16.1.11 | 全局出站事件 Webhook（事件→外部 URL） | —（`routes/webhooks.ts` 是**用户端入站** webhook 配置，见 §22.4） | ❌ | 平台级事件投递引擎未建（另见 §32.1） |

## 16.2 关键架构

- 统一出站抽象仅落地两处：`services/mailer.ts`（邮件）与 upstream 厂商 adapter（推理）。短信/OSS/签章/企微均无 adapter 层，后续接入时应先建 `services/integrations/{sms,oss,signing}` 目录再挂调用点，避免散点硬编码。
- 支付配置走 `system_config` KV + 证书本地文件存储；切换渠道无需改代码。
- WebSocket 单连接复用：`/v1/ws` 先做推理中继，未来通知事件推送应在同一连接上扩展事件命名空间（topic），不另起端口。

## 16.3 未实现项（规划中）

| 优先级 | 事项 | 依赖 |
|---|---|---|
| P1 | 短信通道（验证码替代邮件） | 选云厂商 + 模板报备 |
| P1 | OSS/S3 接入（附件、合同、凭证落库） | 解决 R9 凭证落库（见 §29）与 §26 工单附件 |
| P2 | 电子签章 | 合同管理（§24/§11 合同模块）先行 |
| P2 | 企微/钉钉报表外推 | 依赖 §29.5 资金报表中心 |

> 本主题不重复定义支付/邮件的业务规则，以 §9 充值与 §6 通知体系为准。
