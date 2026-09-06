# 审计引用与 notes 修复记录

- `core-finance-atomic.csv`：总计 4120 条；修复 source_quote 3801 条；修复 source_section 0 条；补写 notes 855 条；无法自动修复 0 条。
- `admin-portal-atomic.csv`：总计 3322 条；修复 source_quote 2180 条；修复 source_section 540 条；补写 notes 0 条；无法自动修复 0 条。

说明：仅生成 v2 审计产物，未覆盖旧 CSV；引用均从对应 source_path 原文逐条提取并做包含校验。
