# recovery-batches batch-01 人工复核索引

- batch-01 输入批次：15 个
- 待复核条目：385 条
- 复核表目录：`recovery-batches/manual-review/`
- 所有复核记录初始为 `PENDING`，不代表通过、不代表已写回。

## 批次清单

| 源文档 | 输入批次 | 人工复核表 | 条数 |
|---|---|---|---:|
| `docs/PRD-代理商体系.md` | `PRD-代理商体系-md-batch-01.csv` | `PRD-代理商体系-md-batch-01-review.csv` | 13 |
| `docs/PRD-代理商支撑增强.md` | `PRD-代理商支撑增强-md-batch-01.csv` | `PRD-代理商支撑增强-md-batch-01-review.csv` | 27 |
| `docs/PRD-客服支撑模块.md` | `PRD-客服支撑模块-md-batch-01.csv` | `PRD-客服支撑模块-md-batch-01-review.csv` | 8 |
| `docs/PRD-核心引擎.md` | `PRD-核心引擎-md-batch-01.csv` | `PRD-核心引擎-md-batch-01-review.csv` | 9 |
| `docs/PRD-用户体系.md` | `PRD-用户体系-md-batch-01.csv` | `PRD-user-system-md-batch-01-review.csv` | 50 |
| `docs/PRD-用户端体验增强.md` | `PRD-用户端体验增强-md-batch-01.csv` | `PRD-用户端体验增强-md-batch-01-review.csv` | 50 |
| `docs/PRD-第三方集成.md` | `PRD-第三方集成-md-batch-01.csv` | `PRD-第三方集成-md-batch-01-review.csv` | 20 |
| `docs/PRD-管理后台.md` | `PRD-管理后台-md-batch-01.csv` | `PRD-管理后台-md-batch-01-review.csv` | 25 |
| `docs/PRD-系统管理员支撑.md` | `PRD-系统管理员支撑-md-batch-01.csv` | `PRD-系统管理员支撑-md-batch-01-review.csv` | 8 |
| `docs/PRD-组件库规范.md` | `PRD-组件库规范-md-batch-01.csv` | `PRD-组件库规范-md-batch-01-review.csv` | 4 |
| `docs/PRD-财务模块增强.md` | `PRD-财务模块增强-md-batch-01.csv` | `PRD-财务模块增强-md-batch-01-review.csv` | 8 |
| `docs/PRD-运营增长模块.md` | `PRD-运营增长模块-md-batch-01.csv` | `PRD-运营增长模块-md-batch-01-review.csv` | 13 |
| `docs/ref-11.5-performance.md` | `ref-11-5-performance-md-batch-01.csv` | `ref-11-5-performance-md-batch-01-review.csv` | 50 |
| `docs/ref-11.6-quote-contract.md` | `ref-11-6-quote-contract-md-batch-01.csv` | `ref-11-6-quote-contract-md-batch-01-review.csv` | 50 |
| `docs/SPEC-§22-用户端体验增强.md` | `SPEC-section-22-用户端体验增强-md-batch-01.csv` | `SPEC-section-22-用户端体验增强-md-batch-01-review.csv` | 50 |

## 使用协议

详细标准见 [`../REVIEW-PROTOCOL.md`](../REVIEW-PROTOCOL.md)。本索引只负责定位批次，不产生审批结论。

## 复核门槛

1. `section_check=PASS`：确认 `recovered_section` 是当前 `source_path` 的真实章节标题或明确位置，并核对 `section_source_lines`。
2. `quote_check=PASS`：确认 `recovered_quote` 是当前源文档的完整、准确、可读原文，并核对 `quote_source_lines`。
3. `assertion_check=PASS`：确认 `recovered_assertion` 语义完整，且只包含一个可独立验证的条件、动作或结果。
4. `format_risk_check=NONE`：确认标点、路径、数值、代码标记、Markdown 表格和转义符没有未经解释的差异。
5. 只有以上四项全部满足、且 `review_notes` 写明依据，才允许将 `review_decision` 改为 `APPROVE`。
6. 证据不足填 `UNKNOWN`；章节错配、引用不完整、残留乱码或断言不原子时填 `REJECT`。

`APPROVE` 仅表示人工复核通过机械恢复结果，不表示源码已实现、测试已通过或业务验收完成。
