# ADR-0008：资金写操作强制操作级 2FA

- 状态：accepted
- 决策日期：2026-08-29
- 生效版本：v1.0.0
- 决策来源：DEC-008

## 决策
- 所有资金写操作强制后端操作级 2FA，`super_admin` 不默认豁免。
- 登录 2FA 与操作级 2FA 分离。
- 操作 token 一次性使用、短时有效，并绑定操作者和操作摘要。
- 权限不足返回 `403 PERMISSION_DENIED`；缺少或未启用返回 `403 OPERATION_2FA_REQUIRED`；错误、过期、重放使用固定错误码。
- 前端二次确认不能替代后端校验。
- 适用于人工上账、充值审核、调账、红冲、退款审核/执行等资金写端点。

## 关联
`audit/08-deployment/document-decision-log.md#dec-008`
