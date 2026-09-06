# 全库文档治理一致性扫描报告

- 文档 ID：GOV-SCAN-20260831-001
- 状态：review
- 生效版本：v1.0.0
- owner：dispatch-agent
- source_of_truth：`00-index/governance-policy.md`、`document-inventory.md`、`document-map.md`
- 扫描日期：2026-08-31

## 扫描结论

- ADR-0030 已登记于 `decision-register.md`、`document-inventory.md`，并已在入口 README 与 document-map 增加可追溯入口。
- #15/#16/#19/#20 的业务裁决均以 ADR-0030 关闭；保留实现、代码守卫和测试映射差距，不再保留“待 BOSS 确认生效”措辞。
- 五大主题 PRD/SPEC 在矩阵中统一标为 `◐`（文档本身为 review），结论均为“未关闭，不得宣称 approved 主题”；结算/对账不再错误标记 `CONFLICT`，其剩余问题是 TEST/OPS 与实现证据缺口。
- 修复了 `03-functional-spec/03-billing-and-finance/manual-topup.md` 的明显乱码行。

## 验证结果

| 检查 | 结果 | 说明 |
|---|---|---|
| `node scripts/req-completeness-check.cjs docs/00-index` | PASS | 9 files / 54 checks / 0 FAIL / GRADE A |
| `node scripts/req-completeness-check.cjs docs/07-quality-and-acceptance` | FAIL（预期） | 6 files / 36 checks / 11 FAIL / GRADE C；TEST/验收文档仍 draft/review，缺真实证据或帮助标记 |
| `node scripts/req-completeness-check.cjs docs/08-operations-and-deployment` | FAIL（预期） | 9 files / 54 checks / 15 FAIL / GRADE C；OPS 不得无证据升 approved，部分基线仍 draft 且有待补证据 |
| Markdown 相对链接检查 | PASS | `00-index`、`07-quality-and-acceptance`、`08-operations-and-deployment`、`09-decisions` 无断链 |
| 残留搜索 | PASS（治理目标范围） | 未发现“待 BOSS 确认生效”或 `????`/`????` 残留；正式 SPEC 中的 `[?]` 帮助标题保留为合法内容 |

## 正式文档状态统计

扫描范围：`01-product`、`02-requirements`、`03-functional-spec`、`05-api`、`06-data-and-architecture`、`07-quality-and-acceptance`、`08-operations-and-deployment`、`09-decisions`，共 84 份 Markdown。

- accepted：30
- approved：26
- review：15
- draft：13
- blocked：0

### 仍为 review 的正式文档（15）

- 用户体系入口/PRD：2
- 五大资金主题 PRD：5
- 五大资金主题 SPEC：5
- 五大资金 TEST：1
- 五大资金 OPS：2

### 仍为 draft 的正式文档（13）

- `01-product/README.md`
- `07-quality-and-acceptance/README.md`
- `07-quality-and-acceptance/acceptance-criteria.md`
- `07-quality-and-acceptance/release-baseline.md`
- `07-quality-and-acceptance/release-gate.md`
- `07-quality-and-acceptance/test-strategy.md`
- `08-operations-and-deployment/README.md`
- `08-operations-and-deployment/backup-and-restore.md`
- `08-operations-and-deployment/deployment-checklist.md`
- `08-operations-and-deployment/deployment-guide.md`
- `08-operations-and-deployment/environment-matrix.md`
- `08-operations-and-deployment/migration-runbook.md`
- `08-operations-and-deployment/process-and-port.md`

## 失败原因

- TEST 目录：入口、验收标准、发布基线、发布门禁、测试策略仍是 draft；五主题 TEST 包是 review 且没有全部真实执行证据；部分正文缺 `[?]` 标记。不能通过 F2/F4，发布基线另有 TBD 导致 F3。
- OPS 目录：基础 runbook/入口仍是 draft；备份恢复和迁移 runbook 含待补/待核验；部分运维文档缺 `[?]` 标记。`finance-ops-package` 与 `release-runbook` 虽已 review，但没有真实生产发布、迁移、恢复或回滚演练证据，不能升格 approved。

本报告不改变 TEST/OPS 状态，也不批准任何业务文档；后续应由对应 owner 补齐真实执行/演练证据后再走联合评审。
