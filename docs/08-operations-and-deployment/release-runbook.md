# 五大资金主题发布 Runbook

- 文档 ID：OPS-BILLING-RELEASE-001
- version：v1.0.0
- status：review
- owner：运维 owner
- source_of_truth：[`finance-ops-package.md`](finance-ops-package.md)、[`deployment-checklist.md`](deployment-checklist.md)、[`00-index/governance-policy.md`](../00-index/governance-policy.md)

> 本文是发布规范，不是生产授权。真实发布、回滚、备份和恢复证据必须归档到 `evidence/finance/<release-id>/`，当前没有真实演练证据。

## 发布前

1. 变更单列明 release-id、影响主题、窗口、执行人/备值班、审批人、财务业务窗口和回滚方案。
2. 只读核验目标环境变量、数据库/Redis、磁盘、当前版本、进程和健康状态；禁止开发 `.env`。
3. 计算发布包及迁移文件 SHA-256，与批准清单逐项核对；不一致立即停止。
4. 验证最近成功备份不超过 24 小时、文件存在、大小合理、checksum 正确且恢复演练状态合格。
5. 获取全流程发布锁/迁移单执行者锁；无法获取、丢失或无法续租均停止，不绕过。

## 执行与失败即停

1. 从 `3cloud/api` 使用唯一已核验入口 `pnpm run db:migrate:manual`。
2. 严格先执行 Drizzle `0000–0016`，再按编号执行手写 `0017–0032`，记录每个文件 checksum、时间、结果。
3. 任一步失败，保留现场和日志、通知运维/架构 owner，不跳过、不手工修补、不启动 PM2。
4. 迁移和 schema/约束/枚举/迁移记录校验全部通过后，才部署构建产物并启动或 reload API、Portal；Console 使用校验过的构建产物。
5. 执行 `/health`、canonical `/api/v1/*` 路由、只读 smoke 和五主题关键路径检查；发布窗口内观察错误率、延迟、队列和资金一致性。

## 发布后验收

- 充值：回调验签/幂等、订单和余额流水一致。
- 人工上账：审批阶段、SoD、转账单号唯一、流水一致。
- 调账：限额、审批链、终态守卫、无负余额。
- 退款/红冲：余额/原路分流正确，重复执行拦截，失败可重试。
- 结算/对账：报告范围、差异、锁账状态和审计一致。

P1/P2 告警、资金不一致、关键 smoke 失败或财务窗口未确认时，冻结写操作并按 [`finance-ops-package.md`](finance-ops-package.md) §5 回滚决策；不得以口头确认替代证据。发布包、日志、checksum、健康检查、监控快照、告警试报和签字记录归档后，才可结束窗口。
