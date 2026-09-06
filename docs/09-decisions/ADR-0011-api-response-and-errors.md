# ADR-0011：API 响应格式与错误码

- 状态：accepted
- 决策日期：2026-08-29
- 生效版本：v1.0.0
- 决策来源：DEC-011

## 决策
- `/api/v1/*` 成功响应统一为 `{ code: 0, message: "ok", data, request_id }`。
- 列表统一使用 `items/page/page_size/total`。
- 错误统一使用 `code/message/details/request_id`，不返回业务 `data`。
- HTTP 状态码按成功、参数、认证、权限、资源、冲突、限流、上游/依赖/超时和内部错误分类。
- 资金错误码纳入唯一错误码专章。
- `/v1/*`、`/anthropic/v1/*` 遵循原协议；deprecated alias 与 canonical 行为一致。
- `request_id` 写入日志、审计和响应；前端按错误码给出具体反馈。

## 关联
`audit/08-deployment/document-decision-log.md#dec-011`
