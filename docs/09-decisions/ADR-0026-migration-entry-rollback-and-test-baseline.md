# ADR-0026：手写迁移执行入口、回滚方式与测试基线

- 状态：accepted
- 决策日期：2026-08-29
- 生效版本：v1.0.0
- 决策来源：BOSS 对 `open-issues.md` 项 7 的确认
- 关联 ADR：ADR-0007、ADR-0014

## 决策

### 唯一执行入口

- 手写迁移统一从 `3cloud/api` 执行：`pnpm run db:migrate:manual`。
- 按编号顺序执行 `0017–0032`，并写入 `_3cloud_manual_migrations`。
- 部署清单不得再调用未确认的 `node api/run-manual-migrations.cjs`。

### 执行安全

- 使用单执行者锁，禁止并发迁移。
- 每个迁移记录编号、文件名、SHA-256 checksum、开始/结束时间、状态、错误和耗时。
- 已成功且 checksum 未变化的迁移可安全跳过；checksum 变化立即停止并报警。
- 任一迁移失败立即停止，不执行后续迁移，不启动 PM2。
- 迁移前必须完成真实数据库备份。

### 回滚

- 失败后立即停止并保留日志，不自动执行未经验证的破坏性回滚。
- PostgreSQL custom dump 使用 `pg_restore`，不得使用 `psql -f`。
- 破坏性迁移必须提供逆向脚本、备份恢复方案、数据校验方案和人工审批记录；无经过验证的逆向脚本时只允许备份恢复。

### 测试基线

- 当前不采用 1159、1132 或 808 中任何一个历史数字作为正式发布基线。
- 正式基线必须记录提交 SHA、执行命令、测试文件范围、通过/失败总数、执行时间和环境信息，并由发布负责人确认后写入唯一 release-gate 文档。

## 影响与迁移
更新迁移 SPEC、ARCH、Runbook、部署清单、release-gate 和 CI/部署检查；补充单执行者、checksum、失败即停、pg_restore、备份恢复和基线登记测试。未完成真实 runner、恢复演练和唯一基线确认前，不得标记发布门禁通过。

## 关联文件
- `docs/08-operations-and-deployment/migration-runbook.md`
- `docs/08-operations-and-deployment/backup-and-restore.md`
- `docs/07-quality-and-acceptance/release-gate.md`
- `docs/00-index/open-issues.md`
- `audit/08-deployment/document-decision-log.md#dec-026`
