# 可逆恢复人工复核批次

- 候选总数：849 条
- 批次大小：50 条以内
- 批次数：26 批
- 所有批次均为人工复核输入，不覆盖 canonical v2 CSV。

## 批次清单

| 源文档 | 批次文件 | 批次号 | 条数 |
|---|---|---:|---:|
| `docs/PRD-代理商体系.md` | `PRD-代理商体系-md-batch-01.csv` | 1 | 13 |
| `docs/PRD-代理商支撑增强.md` | `PRD-代理商支撑增强-md-batch-01.csv` | 1 | 27 |
| `docs/PRD-客服支撑模块.md` | `PRD-客服支撑模块-md-batch-01.csv` | 1 | 8 |
| `docs/PRD-核心引擎.md` | `PRD-核心引擎-md-batch-01.csv` | 1 | 9 |
| `docs/PRD-用户体系.md` | `PRD-用户体系-md-batch-01.csv` | 1 | 50 |
| `docs/PRD-用户体系.md` | `PRD-用户体系-md-batch-02.csv` | 2 | 50 |
| `docs/PRD-用户体系.md` | `PRD-用户体系-md-batch-03.csv` | 3 | 50 |
| `docs/PRD-用户体系.md` | `PRD-用户体系-md-batch-04.csv` | 4 | 18 |
| `docs/PRD-用户端体验增强.md` | `PRD-用户端体验增强-md-batch-01.csv` | 1 | 50 |
| `docs/PRD-用户端体验增强.md` | `PRD-用户端体验增强-md-batch-02.csv` | 2 | 36 |
| `docs/PRD-第三方集成.md` | `PRD-第三方集成-md-batch-01.csv` | 1 | 20 |
| `docs/PRD-管理后台.md` | `PRD-管理后台-md-batch-01.csv` | 1 | 25 |
| `docs/PRD-系统管理员支撑.md` | `PRD-系统管理员支撑-md-batch-01.csv` | 1 | 8 |
| `docs/PRD-组件库规范.md` | `PRD-组件库规范-md-batch-01.csv` | 1 | 4 |
| `docs/PRD-财务模块增强.md` | `PRD-财务模块增强-md-batch-01.csv` | 1 | 8 |
| `docs/PRD-运营增长模块.md` | `PRD-运营增长模块-md-batch-01.csv` | 1 | 13 |
| `docs/SPEC-§22-用户端体验增强.md` | `SPEC-section-22-用户端体验增强-md-batch-01.csv` | 1 | 50 |
| `docs/SPEC-§22-用户端体验增强.md` | `SPEC-section-22-用户端体验增强-md-batch-02.csv` | 2 | 50 |
| `docs/SPEC-§22-用户端体验增强.md` | `SPEC-section-22-用户端体验增强-md-batch-03.csv` | 3 | 50 |
| `docs/SPEC-§22-用户端体验增强.md` | `SPEC-section-22-用户端体验增强-md-batch-04.csv` | 4 | 50 |
| `docs/SPEC-§22-用户端体验增强.md` | `SPEC-section-22-用户端体验增强-md-batch-05.csv` | 5 | 50 |
| `docs/SPEC-§22-用户端体验增强.md` | `SPEC-section-22-用户端体验增强-md-batch-06.csv` | 6 | 31 |
| `docs/ref-11.5-performance.md` | `ref-11-5-performance-md-batch-01.csv` | 1 | 50 |
| `docs/ref-11.6-quote-contract.md` | `ref-11-6-quote-contract-md-batch-01.csv` | 1 | 50 |
| `docs/ref-11.6-quote-contract.md` | `ref-11-6-quote-contract-md-batch-02.csv` | 2 | 50 |
| `docs/ref-11.6-quote-contract.md` | `ref-11-6-quote-contract-md-batch-03.csv` | 3 | 29 |

## 复核规则

1. 逐条确认 `recovered_section` 是当前源文档的真实章节标题或明确位置。
2. 逐条确认 `recovered_quote` 是当前源文档可读原文，且 `quote_source_lines` 定位正确。
3. 逐条确认 `recovered_assertion` 语义完整且只包含一个可独立验证断言。
4. 发现语义错误、章节错配或残余乱码时标记 `REJECT`，不得直接写回。
5. 只有人工确认后的条目才允许进入 reviewed CSV；当前批次不代表已修复。
