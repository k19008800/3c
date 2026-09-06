# Full Gap Report

只读重建（2026-08-30），未修改业务源码、需求原文或审计明细。

## 结论

- 三份 canonical requirement CSV 逐条计数：core-finance-atomic-v2.csv: 4120 valid/0 invalid (physical 4120); admin-portal-atomic-v2.csv: 3322 valid/0 invalid (physical 3322); user-agent-atomic-v2.csv: 6494 valid/0 invalid (physical 6494)。有效记录 **13936** 条进入 `traceability-matrix.csv`。
- 解析异常：0 条；已完成逐行结构与语义校验。
- 矩阵每行严格 8 列，输出为 UTF-8 BOM，Python `utf-8-sig` 可读；未生成 None、错位列或 Unicode replacement。
- 没有真实实现文件:行号/符号与测试用例的完整证据，状态保持 UNKNOWN。

## 解析异常

异常记录不可静默丢弃。异常原始行号、文件、req_id、错误及原始片段见 `traceability-parse-errors.csv`。

## 实质门禁

只有“真实实现定位 + 测试用例”同时存在时才允许 PASS；明确缺失为 GAP/DOC_CODE_GAP，漂移为 CODE_DOC_DRIFT，资料不足为 UNKNOWN。页面级和按钮级 `[?]` 帮助必须以代码与测试验证。
