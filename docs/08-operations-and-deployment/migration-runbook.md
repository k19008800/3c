# 数据库迁移 Runbook

- 文档 ID：OPS-BILLING-002
- 状态：draft
- 生效版本：v0.1.0
- 上游 ADR：ADR-0007、ADR-0014

## 唯一执行入口
从 `3cloud/api` 执行 `pnpm run db:migrate:manual`；不得使用未确认的其他手写迁移命令。

## 执行顺序
1. 检查生产环境变量和数据库连通性；
2. 验证真实可恢复备份；
3. 执行 Drizzle `0000–0016`；
4. 通过唯一入口按编号执行手写 `0017–0032`；runner 会先取得 PostgreSQL advisory lock，未取得锁则安全退出；
5. 校验表、字段、索引、枚举、约束和迁移记录；
6. 任一步失败立即停止，不启动 PM2，也不自动执行未经验证的破坏性回滚。

## Runner 记录与安全行为
`_3cloud_manual_migrations` 记录 `name`、SQL `checksum`（SHA-256）、`status`（running/applied/failed）、`error`、`started_at`、`applied_at` 与 `duration_ms`。旧版仅有 `name/applied_at` 的表会幂等补列；旧记录首次重跑会登记当前 checksum，之后文件被修改将报警并失败。已成功且 checksum 一致的迁移才会跳过。

runner 使用 PostgreSQL `pg_try_advisory_lock` 保证单执行者；进程结束时在 `finally` 释放锁。迁移错误会写入 `failed` 状态并保留脱敏错误与耗时，后续迁移不会执行。数据库连接串密码不会写入日志。

## 当前未决
实现代码与针对性单测已完成；全新库演练、备份恢复演练证据仍待在独立环境真实执行后回填，禁止用历史结果冒充。
