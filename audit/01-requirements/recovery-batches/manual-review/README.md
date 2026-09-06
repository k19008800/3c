# 人工复核工作表说明

本目录中的 CSV 是 recovery-batches 的人工复核工作表，不是正式 reviewed 需求清单，也不覆盖 canonical v2 CSV。

## 逐条复核项目

1. `section_check`：确认 `recovered_section` 是当前 `source_path` 的真实章节标题或明确位置，并核对 `section_source_lines`。
2. `quote_check`：确认 `recovered_quote` 是当前源文档完整、准确、可读的原文，并核对 `quote_source_lines`。
3. `assertion_check`：确认 `recovered_assertion` 语义完整，且只包含一个可独立验证的条件、动作或结果。
4. `format_risk_check`：确认标点、路径、数值、代码标记、Markdown 表格和转义符没有未经解释的差异。
5. `review_decision`：只有前四项满足要求、且 `review_notes` 写明依据时，才可填写 `APPROVE`。

## 允许值

- 检查字段：`PENDING`、`PASS`、`REJECT`。
- `format_risk_check`：`PENDING`、`NONE`、`REVIEW`。
- 最终结论：`PENDING`、`APPROVE`、`UNKNOWN`、`REJECT`。

证据不足保持 `UNKNOWN` 或 `PENDING`，不能提升为 `APPROVE`。发现章节错配、引用不完整、残留乱码、复合断言或无法解释的格式变化时，填 `REJECT`，并在 `review_notes` 说明原因。

## 形成正式清单

只有人工明确 `APPROVE` 的条目才允许进入另行生成的 reviewed 清单；必须保留原始 `req_id`、`source_path` 和人工复核依据。`reviewed-v1` 机械草稿不得直接视为正式需求、PASS 或业务验收证据。

## 复核记录要求

批次完成后，应在批次交付记录中汇总 `PENDING`、`APPROVE`、`UNKNOWN`、`REJECT` 数量、拒绝原因和 `derived_from` 关系。详细协议见 [`../../REVIEW-PROTOCOL.md`](../../REVIEW-PROTOCOL.md)。
