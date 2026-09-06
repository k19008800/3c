# 第一批部署检查清单

- 文档 ID：OPS-RELEASE-001
- 状态：review（候选发布前置清单，当前未准入）
- 生效版本：v0.2.0
- 上游 ADR：ADR-0007、ADR-0014、ADR-0026、ADR-0028、ADR-0029
- 唯一证据根目录：`evidence/finance/<release-id>/`
- 当前判定：`BLOCKED`（真实备份/恢复演练、生产环境检查和发布候选证据尚未完成）

> 本清单是发布门禁，不是生产授权。每一项必须填写执行时间、执行人、命令/检查结果和证据路径；没有证据不得勾选。任一必选项失败或缺证据，立即停止，不启动 PM2。

## A. 发布身份与权限

- [ ] `release-id`、目标环境、commit SHA、变更单、发布时间窗已登记：`evidence/finance/<release-id>/change-approval.md`
- [ ] 执行人、备值班、审批人、财务业务窗口和回滚决策人已登记，并完成职责分离确认
- [ ] 目标环境使用独立生产配置；未复用本地 `.env`；环境变量/数据库/Redis/磁盘/权限检查已留证：`preflight.txt`
- [ ] 发布包、锁文件和每个手写迁移 SQL 的 SHA-256 已生成并与批准清单一致：`package-sha256.txt`、`migration/checksums.txt`

## B. 备份与恢复门禁（当前阻塞）

- [ ] 最近一次成功 PostgreSQL custom archive 备份距发布不超过 24 小时，文件存在且大小合理
- [ ] 备份 sidecar SHA-256 与文件校验一致；本机 7 天/独立存储 30 天保留策略可核验
- [ ] 最近一次独立恢复演练成功：使用 `pg_restore`，未覆盖生产库；证据：`restore/backup-metadata.txt`、`restore/pg-restore.log`、`restore/data-validation.txt`
- [ ] 恢复后结构、索引、约束、迁移记录、关键余额/流水和应用连通性校验通过
- [ ] 已确认失败场景处置：无逆向脚本时仅允许已验证备份恢复；未批准不得猜测性回滚

## C. 数据库迁移

- [ ] Drizzle `0000–0016` 已成功执行并有迁移记录
- [ ] 从 `3cloud/api` 通过唯一入口 `pnpm run db:migrate:manual` 执行手写 `0017–0032`
- [ ] `_3cloud_manual_migrations` 含 `name/checksum/status/error/started_at/applied_at/duration_ms`
- [ ] runner advisory lock 已取得并在验收后释放；锁冲突未绕过
- [ ] 每个迁移 checksum、耗时、状态已留证；任何失败均已停止且后续迁移未执行
- [ ] 分区、字段、索引、枚举、约束与迁移记录结构校验通过：`migration/schema-validation.txt`

## D. 构建与应用

- [ ] API、Console、Portal 构建通过，构建产物 checksum 已归档
- [ ] API/Portal 进程配置、端口和资源限制与 `environment-matrix.md` 一致
- [ ] 仅在数据库迁移和结构校验通过后启动/reload API、Portal；Console 使用已校验构建产物
- [ ] `/health`、`/api/v1/*` canonical 路由、`/v1/*`、`/anthropic/v1/*` smoke 检查通过
- [ ] 集成测试、E2E、verify 和五大资金主题只读验收均有真实输出

## E. 监控与发布后验收

- [ ] API 错误率、延迟、数据库/Redis、迁移锁、队列、outbox、余额-流水差异和对账差异监控已配置并试报
- [ ] 发布后观察窗口、P1/P2 告警接收人和冻结写操作流程已登记：`monitoring/alert-test.txt`
- [ ] 充值、人工上账、调账、退款/红冲、结算/对账只读核验通过：`acceptance/five-topic-readonly-check.md`
- [ ] 财务业务窗口和发布负责人签字确认：`acceptance/finance-signoff.md`

## 当前证据状态（2026-08-31）

| 项目 | 状态 | 证据 |
|---|---|---|
| O-01 迁移 runner 加固 | 已实现，专项测试 5/5；真实全新库演练待执行 | `api/test/manual-migrations-runner.test.ts` |
| O-02 备份/恢复工具安全门 | 已实现，专项测试 3/3；真实 pg_dump/pg_restore 演练待执行 | `api/test/backup-restore.test.ts` |
| API 类型与串行全量单测 | 已验证，1164/1164 | 本次本地执行记录 |
| 生产配置/发布包 | 未执行 | — |
| 真实备份恢复 | 未执行（本机缺少 pg_dump/pg_restore 和独立库） | — |
| 发布后监控/资金验收 | 未执行 | — |

**最终结论：BLOCKED。** 未补齐 B、C、D、E 的真实证据前，不得标记 `ready`，不得部署生产。