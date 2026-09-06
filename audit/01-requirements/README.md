# 需求原子清单与恢复工作区

## 当前基线

- canonical 需求清单：3 份 v2 CSV，共 13,936 条。
- 页面审计：151/151 个基线页面有报告。
- 逻辑审计：15/15 个编号逻辑有报告。
- 当前质量门禁：`FAIL: 2627 findings`。
- 正式验收：`BLOCKED`。

## 文件说明

| 文件 | 用途 |
|---|---|
| `ATOMIC-SCHEMA.md` | 原子需求字段、原子化和源文档完整性规则 |
| `core-finance-atomic-v2.csv` | 核心/财务 canonical 清单 |
| `admin-portal-atomic-v2.csv` | 管理后台 canonical 清单 |
| `user-agent-atomic-v2.csv` | 用户/代理/业务员 canonical 清单 |
| `content-review-triage.csv` | 疑似编码损坏或复合断言的唯一需求分流表 |
| `source-integrity-report.md` | 按源文档统计损坏行和人工重建范围 |
| `source-recovery-batches.md` | 按 source_path 排序的恢复批次 |
| `compound-assertion-triage.csv` | 复合断言人工判定清单 |
| `user-system-manual-review-queue.csv` | `PRD-用户体系.md` 的逐条人工复核队列 |
| `requirements-content-review.md` | 内容质量问题和验收门槛 |

## 人工重建流程

1. 从 `source-recovery-batches.md` 的第 1 批开始。
2. 打开当前 `source_path`，以可读正文重新摘录 `source_section` 和 `source_quote`。
3. 将每行 `atomic_assertion` 限定为一个可独立验证的条件、动作或结果。
4. 如需拆分，保留 `derived_from` 关联，不覆盖原始 v2 底稿。
5. 无法确认原文时保持 `UNKNOWN`，并在 `notes` 写明原因。
6. 每批完成后运行：

```text
python audit/scripts/validate-audit-artifacts.py
python audit/rebuild_reports.py
python audit/01-requirements/build_source_integrity_report.py
```

## 禁止事项

- 禁止对全仓库盲目执行 GBK/UTF-8 转码。
- 禁止用归档 DRD、辅助 SPEC 或代码注释直接替代当前需求出处。
- 禁止因为乱码字符串能在乱码源文件中匹配，就判定引用有效。
- 禁止在需求内容未通过前把 `UNKNOWN` 提升为 `PASS`。
- 禁止在本阶段修改业务源码。

## 完成标准

需求内容门禁只有在以下条件同时满足后才能通过：

- 疑似编码损坏字段为 0，或每条都有人工复核结论；
- 复合断言均已确认是单一条件，或已拆分并保留关联关系；
- 每条引用可回到当前源文档的可读章节/行；
- CSV 固定列数、编号唯一、总数和矩阵一致；
- 需求内容门禁通过后，仍需另行完成源码定位、测试证据和业务验收。
