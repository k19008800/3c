# ADR-0027：出站与入站 Webhook 能力分离

- 状态：accepted
- 决策日期：2026-08-29
- 生效版本：v1.0.0
- 决策来源：BOSS 对 `open-issues.md` 项 8 的确认

## 决策
- 出站 Webhook 与入站 Webhook 作为两个独立能力，分别定义配置、密钥、日志、状态、测试和告警。
- 出站 Webhook：平台向外部 URL 推送事件，平台生成签名，以 HTTP 状态码判断投递结果；单次失败重试，最多重试 3 次，连续 10 次失败暂停目标，进入死信并支持人工补发。
- 入站 Webhook：外部系统向平台专用 endpoint 推送；平台验证签名、时间戳和重放保护，定义独立失败响应、限流和安全审计。
- 入站签名失败不计入出站目标失败次数，不触发出站目标暂停。
- 出站失败不等同于入站签名校验失败；两类状态不得混用。

## 影响与迁移
拆分 Webhook SPEC/API/ARCH/TEST/OPS；补充签名、超时、退避、死信、nonce、时间戳、限流、重放和人工补发测试。旧文档混用的失败语义标记为 superseded。

## 关联文件
- `docs/00-index/open-issues.md`
- `docs/00-index/decision-register.md`
- `audit/08-deployment/document-decision-log.md#dec-027`
