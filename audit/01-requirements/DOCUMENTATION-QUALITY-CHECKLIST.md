# 需求审计文档质量检查清单

版本：v1.0  
日期：2026-08-30

## A. 事实与统计

- [ ] canonical v2 三份 CSV 行数为 4,120 / 3,322 / 6,494，总计 13,936。
- [ ] `req_id` 唯一，字段列符合 `ATOMIC-SCHEMA.md`。
- [ ] 候选数、批次数、批次行数与最新脚本输出一致。
- [ ] 门禁结论、源完整性结论和报告重建结果均记录实际输出，不用旧报告覆盖新结果。
- [ ] 字段级 findings 与去重后的需求数没有混写。

## B. 来源证据

- [ ] 每条记录保留当前 `source_path`。
- [ ] `source_section` 可回到当前源文档的章节或明确位置。
- [ ] `source_quote` 是当前源文档完整、准确、可读的原文。
- [ ] 源文档本身乱码时，不把乱码行当作可靠证据。
- [ ] 任何历史文档、辅助 SPEC 或代码只能作为交叉参考。

## C. 原子断言

- [ ] `atomic_assertion` 只有一个可独立验证条件、动作或结果。
- [ ] 对“以及/同时/并且”等连接词逐条人工判定，不能机械放行或机械拆分。
- [ ] 拆分项保留 `derived_from`、独立引用、独立证据和新编号。
- [ ] 44 条复合断言在关闭前保持 `OPEN`，不得伪造通过。

## D. 编码与格式

- [ ] 机械恢复仅作为候选，不把可转换等同于正确。
- [ ] 转换后不含替换字符、私用区字符或残留 mojibake。
- [ ] 标点、路径、URL、HTTP 方法、字段名、枚举、数值和单位逐项核对。
- [ ] Markdown 标题、表格、列表、粗体、反引号和转义符保持可解释。
- [ ] 无法证明的条目保持 `UNKNOWN` 或 `MANUAL_REBUILD`。

## E. 状态与正式清单

- [ ] 复核表默认 `PENDING`，没有自动 `APPROVE`。
- [ ] `APPROVE` 必须同时满足章节、引用、断言、格式四项条件。
- [ ] `review_notes` 记录可追溯依据。
- [ ] `PENDING`、`UNKNOWN`、`REJECT` 不进入正式 reviewed 通过集。
- [ ] reviewed-v1 与正式 reviewed 清单分开命名和存放。
- [ ] canonical v2 未经明确批准不覆盖。

## F. 最小验证命令

```text
python -m compileall -q audit
python audit/scripts/validate-audit-artifacts.py
python audit/rebuild_reports.py
python audit/01-requirements/build_source_integrity_report.py
```

质量目标不是“报告可生成”，而是证据可追溯、状态不越级、统计可复现、门禁结论真实。
