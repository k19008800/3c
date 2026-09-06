# 备份与恢复

- 文档 ID：OPS-BILLING-004
- 状态：draft
- 生效版本：v0.1.0
- 上游 ADR：ADR-0007、ADR-0014

## 规则
生产迁移前必须完成真实备份并验证可恢复性。唯一责任组件为系统级 `cron` 或宝塔计划任务，每日 04:00（Asia/Shanghai）执行；本机保留 7 天，异地独立存储保留 30 天；成功后复制并校验 SHA-256。每月在独立环境执行恢复演练，不得覆盖生产库。

发布前必须验证最近成功备份不超过 24 小时、文件存在且大小合理、checksum 正确，且最近恢复演练未失败；任一条件不满足则禁止迁移和启动新版本。真实任务和演练证据必须归档到 `evidence/finance/<release-id>/restore/`，不得用历史测试数字替代。

## 本地工具与安全门
`ops/backup-restore.cjs` 提供 `writeChecksum`、`verifyArchive`、`assertIsolatedRestoreTarget` 与 `restoreArchive`：归档必须是 PostgreSQL custom archive，恢复只能调用 `pg_restore --exit-on-error`，且目标库必须明确、不能是生产主机/生产库，也不能等于源库。工具不会自动创建或删除数据库，不会执行生产恢复。

执行前先确认 `pg_dump`、`pg_restore`、`psql` 可用，再按本文件的独立库演练流程执行；缺少客户端或隔离库时状态必须保持 `not_ready`。

## 恢复命令约束
PostgreSQL custom archive 必须使用 `pg_restore`；不得使用 `psql -f`。未经验证的破坏性回滚不得自动执行；无逆向脚本时只允许备份恢复。

## 独立恢复演练流程
1. 在独立环境生成 custom archive：`pg_dump --format=custom --file=<backup.dump> <source-db>`，同时生成 SHA-256 sidecar。
2. 校验归档非空、checksum 一致，并记录文件大小、数据库版本、起止时间。
3. 创建独立目标库（目标名称不得为 `cloud3`/`threecloud`，不得指向生产主机），调用 `restoreArchive` 使用 `pg_restore` 恢复。
4. 恢复后执行结构、索引、约束、迁移记录、关键余额/流水抽样和应用连通性校验。
5. 将命令输出、校验 SQL、耗时、缺陷和复盘写入 `evidence/finance/<release-id>/restore/`；演练失败即保持发布门禁不通过。

## 当前真实状态
2026-09-06 本机已真实执行完整备份恢复演练并 PASS（release `v0.1.0`，driver `ops/backup-restore-drill.cjs`）：
- 本机 PostgreSQL 17 客户端已确认存在（`C:\Program Files\PostgreSQL\17\bin\{pg_dump,pg_restore,psql}.exe`），并已持久化加入用户 PATH（原 `not_ready` 仅因客户端不在 PATH，非缺失）。
- 流程：`pg_dump --format=custom`（显式 `-U/-h/-p`，含 8757017 B 归档）→ SHA-256 sidecar 校验一致 → `assertIsolatedRestoreTarget` → 建隔离库 `threecloud_restore_drill` → `pg_restore --exit-on-error` → 结构/数据校验（103 public 表；users=15854、customer_balances=13403、balance_transactions=27424、可用余额合计 1691471.81143040）→ 源/恢复行数一致 → 删除演练库。
- 证据：`evidence/finance/v0.1.0/restore/`（`threecloud_v3-20260906T04093.dump` + `.sha256` + `restore-*.log` + `verify-*.sql.out`）。生产库未受影响。
- 首次演练中认证失败/参数缺省等 2 次失败轮次已记录在日志，最终轮次 PASS；本文件不再为 `draft` 的「未执行」状态，备份恢复门禁解除（见 `docs/07-quality-and-acceptance/release-baseline.md`）。

## 注意
恢复前后必须执行结构、数据和应用版本兼容性校验；没有真实命令输出和独立目标库证据，不得标记恢复演练通过。
