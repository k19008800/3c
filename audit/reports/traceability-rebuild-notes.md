# Traceability Rebuild Notes

- 重建日期：2026-08-30
- 输入逐条计数：core-finance-atomic-v2.csv: 4120 valid/0 invalid (physical 4120); admin-portal-atomic-v2.csv: 3322 valid/0 invalid (physical 3322); user-agent-atomic-v2.csv: 6494 valid/0 invalid (physical 6494)
- 有效矩阵记录：13936；解析异常：0。
- 异常行完整写入 `traceability-parse-errors.csv`，未静默丢弃；矩阵输出前执行 8 列/None 严格门禁。
- 所有新 CSV/汇总报告采用 UTF-8 BOM（`utf-8-sig`）；未修改业务源码或 canonical CSV。
