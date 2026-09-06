# TEST-BILLING-003：五大资金主题测试追溯与真实证据登记

- 文档 ID：TEST-BILLING-003
- 状态：review
- 生效版本：v0.1.0
- owner：test-agent（执行）；dispatch-agent（追踪）
- 上游：`acceptance-criteria.md`、五主题 SPEC/状态机、ADR-0026、ADR-0028、ADR-0029
- 发布基线：`release-baseline.md`

> 本表区分“测试文件存在”和“本次真实执行通过”。只有命令输出、commit SHA、环境快照和原始日志同时存在，才能登记为通过。历史 808/1132/1159 不作为本表证据。

## 1. 真实执行证据

| 证据项 | 当前记录 | 状态 |
|---|---|---|
| 候选 SHA | `97928c668e0fff6ea78e5c26d1c82d5d0786de60` | 已登记 |
| 环境 | Node v24.18.0、pnpm 11.22.0、Vitest 3.2.7、PostgreSQL 17.10、Redis localhost:6379 | 已登记 |
| API 资金专项 | `test-reports/finance-rerun-2026-08-31.txt`，8 文件 160 passed | 已执行；范围有限 |
| API 串行全量 | 81 文件、1189/1189 passed（测试夹具补齐历史残留清理后重新执行） | 已执行 |
| O-01 runner 专项 | `api/test/manual-migrations-runner.test.ts`，5/5 passed | 已执行 |
| O-02 安全门专项 | `api/test/backup-restore.test.ts`，3/3 passed | 已执行；非真实恢复 |
| 真实迁移演练 | 独立全新库 0000–0032 | blocked：本机无独立库/pg 客户端 |
| 真实备份恢复 | custom archive + `pg_restore` | blocked：本机无 `pg_dump`/`pg_restore` |

## 2. 主题→测试→证据矩阵

| 主题 | 必测范围 | 已有测试/命令 | 当前证据状态 | 未闭环项 |
|---|---|---|---|---|
| 充值 | 金额边界/精度、支付回调验签与金额核对、重复回调幂等、审批状态机、终态不可逆、权限/2FA、事务补偿 | `api/src/routes/admin-recharge-orders.test.ts`、`api/src/routes/admin-recharge-audit.test.ts`、`api/src/routes/admin-manual-topup.test.ts`、`api/test/billing.test.ts`；用户创建幂等已接入 `api/src/routes/recharge.ts` | 管理端充值审批整套专项 10/10；用户创建幂等代码已落地，独立用户端请求证据待补 | 支付回调验签/金额核对/重复回调契约、渠道熔断、三级审批边界、approval_phase 序列化需独立用例（open-issues #14） |
| 人工上账 | 单笔边界、创建预占、soft/hard 限额、分级审批、SoD、2FA、幂等、终态、余额/流水/审计/通知边界 | `api/src/routes/admin-manual-topup.test.ts`、`api/src/middleware/require-operation-2fa.test.ts`、`api/src/services/billing/credit-limit.test.ts`、`api/src/services/idempotency.test.ts` | 整文件 35/35；全量串行包含通过 | outbox 失败注入与完整非法状态矩阵待补 |
| 调账 | tier 边界、增减方向、余额不足、审批/SoD/2FA、限额并发、幂等、红冲原单保护、事务回滚 | `api/src/routes/admin-adjust.test.ts`、`api/src/services/billing/credit-limit.test.ts`、`api/test/billing.test.ts` | 文件存在；全量串行通过 | 失败注入、完整状态机矩阵和对账补偿待补 |
| 退款/红冲 | 金额精度与可退上限、方向互斥、状态机、终态、权限/2FA、并发/重复执行、通道重试、outbox | `api/src/routes/admin-risk-finance.test.ts`：退款审核/执行；调账红冲覆盖于 `api/src/routes/admin-adjust.test.ts` | T-03 集成回归 2 文件 30/30；审核后仅 `approved`、execute 后 `completed`、余额仅增加一次、重复 execute 409 已验证 | 失败注入/重试、执行并发、三类退款分流、真实支付通道、outbox 通知及 processing 崩溃恢复尚未实现/验证；不能标记完整通过 |
| 结算/对账 | 精度/差额、周期与报告状态机、锁/幂等、权限/2FA、批量失败补偿、CSV/API 契约 | `api/test/agent-settlement.test.ts`、`api/test/vendor-settlement.test.ts`、`api/test/reconciliation-t04.test.ts`、`api/src/middleware/require-operation-2fa.test.ts`、`api/src/routes/2fa-operation.test.ts` | 供应商结算专项 43/43；T-04 对账专项 6/6（含严格日期、running 并发拒绝、2FA/权限/SoD），相关权限+对账 15/15，操作级 2FA 回归 18/18；本轮相关证据合计 31/31（真实 Fastify + PostgreSQL） | P0 已有正式报告/差异表、日期边界、报告查询/CSV、权限、显式 processing、终态/备注/SoD、差异写端点操作级 2FA、供应商确认原子守卫；仍缺 Redis 对账锁、失败补偿/outbox、代理正式周期 `open→closed→settled`、外部账单导入与真实跨系统对账、资金补账/核销事务 |

## 3. 跨主题强制门禁

- **金额**：边界、精度、舍入必须有独立断言；不能只依赖路由 happy path。
- **状态机**：合法转移、非法转移、重复请求、所有终态不可逆必须有断言。
- **资金一致性**：业务单、余额、流水、审计同事务；失败补偿必须证明无部分提交。
- **职责与安全**：权限、SoD、操作级 2FA、幂等分别留证，不能用登录成功替代。
- **契约**：canonical/alias、envelope、分页、错误码必须引用正式 API 文档并执行契约测试。
- **迁移/恢复**：checksum、单执行者、失败即停、custom archive 恢复必须有真实证据；工具单测不等价于恢复演练。
- **发布**：任一必测项为“待补/blocked”，`release-baseline.md` 继续保持 `not_ready`。

## 4. 当前结论

T-01 映射表已建立，已把五主题的现有测试、执行证据和缺口分开登记。T-02 已补上用户自助充值创建的 Redis/DB 幂等接入；T-03 已将余额退款审核与执行拆分，相关集成回归 30/30。T-04 P0 已补正式 `reconciliation_reports`/`reconciliation_mismatches`、平台侧真实消费汇总、报告查询/CSV、严格日期校验、running 并发数据库闸门、显式 `pending→processing`、终态/备注/SoD、差异写端点操作级 2FA 与供应商结算 `draft→confirmed` 原子守卫；对账 6/6、相关权限/2FA 回归通过，TypeScript、ESLint 和 diff 检查通过。该证据不等价于完整 T-04：仍缺 Redis 对账锁、失败补偿/outbox、代理正式周期 `open→closed→settled`、外部账单导入/真实跨系统对账及补账/核销资金事务。仍缺支付回调契约/验签/金额核对/重复回调、渠道熔断、三级审批逐级边界及 approval_phase 序列化；退款还缺失败注入/重试、执行并发、三类分流、真实支付通道、outbox 通知和 processing 崩溃恢复。当前不能将 TEST 层或发布基线标记为 ready，真实迁移和备份恢复演练也仍未完成。
