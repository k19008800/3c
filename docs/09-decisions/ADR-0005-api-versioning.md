# ADR-0005：API 路径与版本

- 状态：accepted
- 决策日期：2026-08-29
- 生效版本：v1.0.0
- 决策来源：DEC-005

## 决策
- `/v1/*`：对外 OpenAI 兼容 API canonical 路径。
- `/anthropic/v1/*`：对外 Anthropic 兼容 API canonical 路径。
- `/api/v1/*`：平台业务 API canonical 路径。
- `/api/v1/v1/*`：仅作 deprecated alias，不用于新集成；兼容窗口持续至 `v1.x`，在 `v2.0.0` 移除。
- 旧 API reference 中错误的单层 `/api/v1/models`、`/api/v1/chat/completions` 等路径不是兼容 alias，必须标记为错误历史内容并修正。
- alias 与 canonical 必须共享 handler，并保持认证、权限、计费、幂等、响应和错误行为一致。
- alias 调用可通过响应头或日志发送弃用告警，但不得改变响应 envelope。
- API 文档必须标注 canonical/alias、版本、适用对象、推荐性和废止信息。

## 关联
`audit/08-deployment/document-decision-log.md#dec-005`
