# 需求源文档完整性报告

复核日期：2026-08-30

本报告按 canonical v2 需求清单的 `source_path` 汇总源文档可读性。疑似乱码只作为阻断信号，不尝试推测原文。

## 门禁规则

- 源文档存在疑似编码损坏行时，相关需求不得自动清除内容质量问题。
- 只有源文档可读、引用可定位、语义可交叉验证时，才允许进入自动修复候选。
- `source-integrity-report.csv` 中 `MANUAL_REBUILD` 的文档必须人工逐段重建。

## 汇总

| source_path | 受影响需求 | 源文档行数 | 损坏行 | 可读行 | 损坏比例 | 自动处理 |
|---|---:|---:|---:|---:|---:|---|
| `docs/PRD-用户体系.md` | 407 | 1326 | 254 | 1072 | 0.192 | MANUAL_REBUILD |
| `docs/SPEC-§22-用户端体验增强.md` | 290 | 2192 | 457 | 1735 | 0.208 | MANUAL_REBUILD |
| `docs/PRD-管理后台.md` | 173 | 1344 | 240 | 1104 | 0.179 | MANUAL_REBUILD |
| `docs/ref-11.6-quote-contract.md` | 147 | 326 | 55 | 271 | 0.169 | MANUAL_REBUILD |
| `docs/PRD-运营增长模块.md` | 135 | 402 | 63 | 339 | 0.157 | MANUAL_REBUILD |
| `docs/PRD-系统管理员支撑.md` | 87 | 442 | 50 | 392 | 0.113 | MANUAL_REBUILD |
| `docs/PRD-核心引擎.md` | 59 | 352 | 72 | 280 | 0.205 | MANUAL_REBUILD |
| `docs/PRD-客服支撑模块.md` | 55 | 272 | 24 | 248 | 0.088 | MANUAL_REBUILD |
| `docs/PRD-用户端体验增强.md` | 45 | 475 | 55 | 420 | 0.116 | MANUAL_REBUILD |
| `docs/PRD-财务模块增强.md` | 36 | 303 | 55 | 248 | 0.182 | MANUAL_REBUILD |
| `docs/PRD-代理商支撑增强.md` | 32 | 272 | 34 | 238 | 0.125 | MANUAL_REBUILD |
| `docs/PRD-概览与运营模型.md` | 18 | 51 | 14 | 37 | 0.275 | MANUAL_REBUILD |
| `docs/PRD-组件库规范.md` | 17 | 113 | 19 | 94 | 0.168 | MANUAL_REBUILD |
| `docs/ref-11.5-performance.md` | 10 | 249 | 43 | 206 | 0.173 | MANUAL_REBUILD |
| `docs/PRD-第三方集成.md` | 6 | 107 | 11 | 96 | 0.103 | MANUAL_REBUILD |
| `docs/PRD-代理商体系.md` | 5 | 111 | 18 | 93 | 0.162 | MANUAL_REBUILD |

## 结论

- 涉及问题需求的源文档：16 份。
- 需要人工重建的源文档：16 份。
- 本报告不覆盖源文档、不覆盖 canonical CSV，不把历史归档或辅助 SPEC 直接替换为当前需求出处。
