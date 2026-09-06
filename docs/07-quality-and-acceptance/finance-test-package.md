# 五大资金主题 TEST 交付包与追溯矩阵

- 文档 ID：TEST-BILLING-FIVE-THEMES-001
- version：v0.1.0
- 状态：review
- owner：test-agent（执行证据）；dispatch-agent（治理追踪）
- source_of_truth：[`00-index/governance-policy.md`](../00-index/governance-policy.md)、五主题 SPEC 与 [`acceptance-criteria.md`](acceptance-criteria.md)
- 对应发布基线：[`release-baseline.md`](release-baseline.md)

> 本文档是测试设计与证据登记，不是业务批准。除“已存在文件（未在本次运行执行）”外，所有证据状态均如实标为“待执行”或“待新增”。任何测试未执行不得视为通过。测试 ID 在本文档内唯一。

## 1. 证据状态与命令约定

| 状态 | 含义 |
|---|---|
| 已存在文件（待执行） | 仓库中确有该测试文件，但本次未以该 ID 运行，不能作为通过证据 |
| 待新增 | 当前未找到对应测试文件，需新增测试后执行 |
| 待执行 | 测试设计已完成，尚无真实执行输出 |
| blocked | 前置裁决、环境或实现缺失，暂不能执行 |

本次已实际执行的质量检查命令为：

```bash
node scripts/req-completeness-check.cjs docs/07-quality-and-acceptance
```

真实结果：6 个文件、36 项检查、11 FAIL，GRADE=C；该结果是质量目录完整性结果，不构成资金 TEST ID 的通过证据。

## 1.1 当前候选版本真实执行记录

- **候选提交 SHA**：`97928c668e0fff6ea78e5c26d1c82d5d0786de60`
- **执行时间**：2026-08-31 16:31（Asia/Shanghai）
- **环境**：Node v24.18.0；pnpm 11.22.0；Vitest 3.2.7；PostgreSQL 17.10（localhost:5432）；Redis localhost:6379
- **证据文件**：[`test-reports/finance-rerun-2026-08-31.txt`](../../test-reports/finance-rerun-2026-08-31.txt)
- **执行结果**：8 个测试文件通过，160 passed，0 failed，0 skipped，退出码 0；`pnpm --filter @3cloud/api typecheck` 通过。
- **证据边界**：本次仅覆盖仓库中已有的人工上账、2FA、幂等、余额/计费、代理结算、渠道结算测试；退款/红冲专项、对账报告状态机、故障补偿/outbox、迁移/恢复/回滚等 TEST ID 仍未执行或待新增，不能据此将 TEST 或 release baseline 标为 ready。

标准执行命令（执行时须保存完整 stdout、时间、提交 SHA、环境版本到发布基线）：

- 单个 API/服务测试：`pnpm --filter @3cloud/api exec vitest run <测试文件>`
- 资金相关候选回归：`pnpm --filter @3cloud/api exec vitest run src/routes/admin-manual-topup.test.ts src/routes/admin-adjust.test.ts src/services/billing/credit-limit.test.ts src/middleware/require-operation-2fa.test.ts src/services/idempotency.test.ts test/billing.test.ts test/agent-settlement.test.ts test/vendor-settlement.test.ts`
- 全量 API：`pnpm --filter @3cloud/api test`
- 集成验证：`pnpm verify`
- 完整性检查：`node scripts/req-completeness-check.cjs docs/07-quality-and-acceptance`
- 迁移/备份恢复：当前没有已登记的可引用测试文件；不得用 `pnpm db:migrate` 单次成功替代恢复证据。

## 2. 需求→测试→证据总矩阵

### 2.1 充值（SPEC-BILLING-001）

| TEST/AC ID | 需求/验收断言 | 测试文件（真实路径） | 执行命令 | 证据状态 |
|---|---|---|---|---|
| RECH-AC-001 | 自助充值金额 ≥¥1、≤¥1,000,000、最多 2 位小数；人工上账 >0 | [`api/src/routes/admin-manual-topup.test.ts`](../../api/src/routes/admin-manual-topup.test.ts)、`api/test/billing.test.ts` | `pnpm --filter @3cloud/api exec vitest run src/routes/admin-manual-topup.test.ts test/billing.test.ts` | 已存在文件（待执行） |
| RECH-AC-002 | 人工上账单笔上限 ¥50,000；边界拒绝且不进入终审 | `api/src/routes/admin-manual-topup.test.ts` | 同上 | 已存在文件（待执行；需核对现有断言与裁决一致） |
| RECH-AC-003 | 输入精度、内部数值精度与展示舍入不丢分/不使用浮点最终结算 | `api/test/billing.test.ts`；待新增精度契约用例 | `pnpm --filter @3cloud/api exec vitest run test/billing.test.ts` | 部分已有，精度专项待新增 |
| RECH-AC-004 | 回调/审核状态机：pending→paid；超时 expired；rejected/failed；终态不可逆、非法转移拒绝 | `api/src/routes/admin-manual-topup.test.ts`、`api/src/routes/admin-recharge-orders.test.ts`、待新增回调状态机测试 | `pnpm --filter @3cloud/api exec vitest run src/routes/admin-manual-topup.test.ts src/routes/admin-recharge-orders.test.ts` | 已存在文件（待执行）；回调/终态覆盖待新增 |
| RECH-AC-005 | 支付回调签名、金额核对、重复回调幂等且不重复入账 | `api/src/routes/admin-recharge-orders.test.ts`；待新增 callback contract test | `pnpm --filter @3cloud/api exec vitest run src/routes/admin-recharge-orders.test.ts` | 部分待执行；签名专项待新增 |
| RECH-AC-006 | `finance.topup`、未登录/越权、创建人不得审批；操作级 2FA | `api/src/routes/admin-manual-topup.test.ts`、`api/src/middleware/require-operation-2fa.test.ts` | `pnpm --filter @3cloud/api exec vitest run src/routes/admin-manual-topup.test.ts src/middleware/require-operation-2fa.test.ts` | 已存在文件（待执行） |
| RECH-AC-007 | API envelope、错误码、分页字段、canonical/alias、Idempotency-Key 同摘要回放/异摘要冲突/Redis 不可用 | `api/src/routes/admin-manual-topup.test.ts`、`api/src/services/idempotency.test.ts`、`api/src/routes/vendor-alias.test.ts` | `pnpm --filter @3cloud/api exec vitest run src/routes/admin-manual-topup.test.ts src/services/idempotency.test.ts src/routes/vendor-alias.test.ts` | 已存在文件（待执行；分页/alias 需核对） |
| RECH-AC-008 | 并发重复审核、并发建户只入账一次；失败整体补偿；余额/流水/审计/outbox 同事务边界 | `api/src/routes/admin-manual-topup.test.ts`、`api/src/services/billing/balance.test.ts`；outbox/失败注入待新增 | 同上 | 部分已有，outbox/失败注入待新增 |
| RECH-AC-009 | 迁移 checksum、备份恢复、失败即停、回滚准入 | 待新增 `api/test/migrations-finance.test.ts` 与恢复演练证据 | `pnpm --filter @3cloud/api exec vitest run test/migrations-finance.test.ts` | 待新增；blocked（无恢复演练证据） |

### 2.2 人工上账（SPEC-BILLING-002）

| TEST/AC ID | 需求/验收断言 | 测试文件（真实路径） | 执行命令 | 证据状态 |
|---|---|---|---|---|
| MT-AC-001 | amount 0/负/超过 ¥50,000/超过 2 位小数、note/用户状态校验 | [`api/src/routes/admin-manual-topup.test.ts`](../../api/src/routes/admin-manual-topup.test.ts) | `pnpm --filter @3cloud/api exec vitest run src/routes/admin-manual-topup.test.ts` | 已存在文件（待执行） |
| MT-AC-002 | ≤¥10,000 一审；>¥10,000 且≤¥50,000 二审；非法阶段与终态不可逆 | `api/src/routes/admin-manual-topup.test.ts`；待新增状态机矩阵 | 同上 | 部分已有，非法转移待新增 |
| MT-AC-003 | `finance.topup`、SoD（创建≠审批、一级≠二级）、操作级 2FA 且错误码非 401 | `api/src/routes/admin-manual-topup.test.ts`、`api/src/middleware/require-operation-2fa.test.ts` | 同上 | 已存在文件（待执行） |
| MT-AC-004 | 创建/审核 API 201/200、envelope、列表分页、固定错误码 | `api/src/routes/admin-manual-topup.test.ts` | 同上 | 已存在文件（待执行） |
| MT-AC-005 | 同 Key 回放、异摘要 409、transfer_no 唯一、并发审批只一笔余额/流水 | `api/src/routes/admin-manual-topup.test.ts`、`api/src/services/idempotency.test.ts` | 同上 | 已存在文件（待执行） |
| MT-AC-006 | 入账事务失败回滚；通知失败由 outbox 重试且不回滚资金 | 待新增 `api/test/manual-topup-compensation.test.ts` | `pnpm --filter @3cloud/api exec vitest run test/manual-topup-compensation.test.ts` | 待新增 |
| MT-AC-007 | migration、备份恢复、回滚前置检查与发布准入关联 | 待新增迁移/恢复测试与演练记录 | 见 §1 迁移/备份恢复命令 | blocked |

### 2.3 调账（SPEC-BILLING-003）

| TEST/AC ID | 需求/验收断言 | 测试文件（真实路径） | 执行命令 | 证据状态 |
|---|---|---|---|---|
| ADJ-AC-001 | tier 边界 ¥10,000/¥10,000.01/¥100,000/¥100,000.01、调减 ¥10,000 特例；金额精度/上下限 | [`api/src/routes/admin-adjust.test.ts`](../../api/src/routes/admin-adjust.test.ts)、[`api/src/services/billing/credit-limit.test.ts`](../../api/src/services/billing/credit-limit.test.ts) | `pnpm --filter @3cloud/api exec vitest run src/routes/admin-adjust.test.ts src/services/billing/credit-limit.test.ts` | 已存在文件（待执行） |
| ADJ-AC-002 | pending→pending_level2→pending_super→approved；rejected/failed/reversed；终态不可逆/非法转移拒绝 | `api/src/routes/admin-adjust.test.ts`；待新增完整非法矩阵 | 同上 | 部分已有，完整矩阵待新增 |
| ADJ-AC-003 | 权限、SoD、super_admin 终审边界、代审原因与操作级 2FA | `api/src/routes/admin-adjust.test.ts`、`api/src/middleware/require-operation-2fa.test.ts` | `pnpm --filter @3cloud/api exec vitest run src/routes/admin-adjust.test.ts src/middleware/require-operation-2fa.test.ts` | 已存在文件（待执行） |
| ADJ-AC-004 | 调账 API 错误码、分页台账、幂等 Key、非法阶段响应 envelope | `api/src/routes/admin-adjust.test.ts`、`api/src/services/idempotency.test.ts` | 同上 | 已存在文件（待执行；分页需核对） |
| ADJ-AC-005 | advisory lock 双维限额并发先到先得；重复请求仅一笔限额事件/资金变动 | `api/src/services/billing/credit-limit.test.ts`、`api/src/routes/admin-adjust.test.ts` | `pnpm --filter @3cloud/api exec vitest run src/services/billing/credit-limit.test.ts src/routes/admin-adjust.test.ts` | 已存在文件（待执行） |
| ADJ-AC-006 | 余额不足不写负数；事务失败补偿；红冲原单不可改删且累计不回退 | `api/src/routes/admin-adjust.test.ts`、`api/test/billing.test.ts`；失败注入待新增 | 同上 | 部分已有，失败注入待新增 |
| ADJ-AC-007 | 迁移 0030、备份恢复、回滚准入 | 待新增 `api/test/migrations-finance.test.ts` | 见 §1 | 待新增；blocked |

### 2.4 退款/红冲（SPEC-BILLING-004）

| TEST/AC ID | 需求/验收断言 | 测试文件（真实路径） | 执行命令 | 证据状态 |
|---|---|---|---|---|
| REF-AC-001 | 退款金额精度、可退上限、部分退款累计不超原单；舍入规则 | 待新增 `api/test/refund-reversal.test.ts` | `pnpm --filter @3cloud/api exec vitest run test/refund-reversal.test.ts` | 待新增 |
| REF-AC-002 | balance_refund/channel_refund/reversal 资金方向互斥；红冲禁止负余额 | 待新增 `api/test/refund-reversal.test.ts` | 同上 | 待新增 |
| REF-AC-003 | pending→approved→processing→completed；failed 可重试；rejected/completed/reversed 终态不可逆 | 待新增 `api/test/refund-state-machine.test.ts` | `pnpm --filter @3cloud/api exec vitest run test/refund-state-machine.test.ts` | 待新增 |
| REF-AC-004 | refund/reversal 权限、审批 SoD、分级审批与操作级 2FA | 待新增 `api/test/refund-permissions.test.ts` | `pnpm --filter @3cloud/api exec vitest run test/refund-permissions.test.ts` | 待新增 |
| REF-AC-005 | API envelope、错误码、分页、同 Key 回放/异摘要冲突、重复执行 409 | 待新增 `api/test/refund-contract.test.ts` | `pnpm --filter @3cloud/api exec vitest run test/refund-contract.test.ts` | 待新增 |
| REF-AC-006 | 并发退款/重复回调只执行一次；通道失败重试与补偿；outbox 通知失败不回滚 | 待新增 `api/test/refund-concurrency-compensation.test.ts` | `pnpm --filter @3cloud/api exec vitest run test/refund-concurrency-compensation.test.ts` | 待新增 |
| REF-AC-007 | 退款/红冲迁移 checksum、备份恢复与回滚准入 | 待新增迁移/恢复测试 | 见 §1 | blocked |

### 2.5 结算/对账（SPEC-BILLING-005）

| TEST/AC ID | 需求/验收断言 | 测试文件（真实路径） | 执行命令 | 证据状态 |
|---|---|---|---|---|
| SET-AC-001 | 对账/佣金/结算金额精度、舍入、差额阈值与非负调整 | [`api/test/agent-settlement.test.ts`](../../api/test/agent-settlement.test.ts)、[`api/test/vendor-settlement.test.ts`](../../api/test/vendor-settlement.test.ts)；差额专项待新增 | `pnpm --filter @3cloud/api exec vitest run test/agent-settlement.test.ts test/vendor-settlement.test.ts` | 已存在文件（待执行）；差额专项待新增 |
| SET-AC-002 | 对账 pending→running→completed/failed；周期 open→closed→settled；结算单 pending→settled；终态不可逆 | `api/test/agent-settlement.test.ts`、`api/test/vendor-settlement.test.ts`；报告状态机待新增 | 同上 | 部分已有，报告状态机待新增 |
| SET-AC-003 | 查看/处理/生成/调整/代理本人确认权限、SoD、2FA | `api/test/vendor-settlement.test.ts`；权限/2FA 专项待新增 | `pnpm --filter @3cloud/api exec vitest run test/vendor-settlement.test.ts middleware/require-operation-2fa.test.ts` | 部分已有，待执行 |
| SET-AC-004 | 报告/结算列表分页、CSV/API envelope、错误码、非本人 404 | `api/test/vendor-settlement.test.ts`、`api/test/agent-settlement.test.ts` | `pnpm --filter @3cloud/api exec vitest run test/vendor-settlement.test.ts test/agent-settlement.test.ts` | 已存在文件（待执行） |
| SET-AC-005 | 同范围对账锁、重复关账/确认幂等、重复请求不重复生成 | `api/test/vendor-settlement.test.ts`、`api/test/agent-settlement.test.ts`；reconciliation lock 待新增 | 同上 | 部分已有，锁专项待新增 |
| SET-AC-006 | 关账分批失败回滚；差异补账/核销原子补偿；outbox 失败重试 | 待新增 `api/test/reconciliation-compensation.test.ts` | `pnpm --filter @3cloud/api exec vitest run test/reconciliation-compensation.test.ts` | 待新增 |
| SET-AC-007 | 迁移、备份恢复、回滚准入及发布基线关联 | 待新增迁移/恢复测试与演练记录 | 见 §1 | blocked |

## 3. 跨主题门禁与证据要求

1. **真实证据**：每个 ID 执行时必须记录命令、时间、提交 SHA、Node/pnpm/Vitest 版本、PG/Redis 版本、通过/失败/跳过数和原始输出路径；仅文件存在不能填“通过”。
2. **状态机**：每个主题必须有合法转移、非法转移、重复请求、所有终态不可逆的断言；退款/对账当前缺少实现级测试，保持待新增。
3. **资金一致性**：余额、流水、业务单、审计、通知 outbox 的提交/回滚边界必须有故障注入证据；通知失败不得伪装成资金事务通过。
4. **迁移与恢复**：必须在隔离环境验证迁移顺序/checksum、备份可恢复、失败即停、回滚准入；开发机一次 migrate 成功不等价于恢复演练。
5. **发布门禁**：将各 ID 的结果汇总到 [`release-baseline.md`](release-baseline.md)；任一必选项未执行、失败或 blocked，整体不得 ready。
6. **UI 帮助**：五主题页面标题和每个操作入口 `[?]` 的源码、路由、API、权限与运行态证据需另行补入执行记录；SPEC 已有对照表不替代 UI 实测。

## 4. 当前结论

- 本交付包共 **37 个唯一 TEST/AC ID**：充值 9、人工上账 7、调账 7、退款/红冲 7、结算/对账 7，另跨主题门禁以文档规则执行，不重复计 ID。
- 已存在候选测试文件覆盖充值、人工上账、调账、基础余额、2FA、幂等和部分结算；本任务未执行这些候选测试，因此均不能标为通过。
- 退款/红冲、对账报告状态机、失败补偿/outbox 故障注入、迁移 checksum、备份恢复和回滚准入仍为待新增或 blocked。
- 文档状态保持 `review`，五主题整体仍不得宣称 approved 或可上线。
