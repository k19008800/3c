# `PRD-用户体系.md` 人工复核批次

复核日期：2026-08-30

## 批次范围

- 目标源文档：`docs/PRD-用户体系.md`
- 受影响需求：407 条
- 自动恢复候选：0 条（见 `user-system-strict-encoding-probe.csv`）
- 当前处理状态：`MANUAL_REVIEW`

## 人工复核顺序

1. 以当前源文档的实际章节和段落为准，不以乱码 CSV 内容反推原文。
2. 对每条需求重新确定 `source_section` 和 `source_quote`。
3. 将 `atomic_assertion` 改写为单一可验证断言；原文包含多个动作或条件时拆成多条，并建立 `derived_from` 关联。
4. 对无法确认的内容保留 `UNKNOWN`，在 `notes` 写明缺少原始可读文本，不得用猜测或归档近似文本替代。
5. 修复完成后逐条检查：引用在当前源文件中存在、章节真实存在、断言与引用语义一致。

## 禁止操作

- 禁止全仓库批量执行 GBK/UTF-8 转码。
- 禁止用 `docs/_archive/DRD-用户端.md` 直接替换当前 PRD 引用。
- 禁止仅因为引用能在乱码源文件中匹配，就判定内容正确。
- 禁止修改业务源码、旧版 CSV 或原始 PRD 作为“修复”。

## 工具证据

- 初步探测：`user-system-encoding-probe.csv`
- 严格探测：`user-system-strict-encoding-probe.csv`
- 批次总表：`source-recovery-batches.md`
- 质量报告：`audit/09-reviews/artifact-quality-report.md`

## 当前结论

本批次不能自动修复。正式需求验收继续保持 BLOCKED，直到 407 条记录逐条完成可读引用、原子断言和来源依据复核。
