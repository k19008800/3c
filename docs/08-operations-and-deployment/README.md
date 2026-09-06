# 运维与部署入口

- 文档 ID：OPS-INDEX-001
- 状态：draft
- 生效版本：v0.1.0

部署、迁移、备份、回滚、进程和发布后验收须按 ADR-0007、ADR-0014 同步；当前仅建立文档与证据模板，不执行部署。

## 五大资金主题 OPS 交付包

- 总 OPS：[`finance-ops-package.md`](finance-ops-package.md)（发布、迁移、checksum、单执行者锁、失败即停、恢复、回滚、监控、值班和演练证据）
- 发布 Runbook：[`release-runbook.md`](release-runbook.md)
- 数据迁移基线：[`migration-runbook.md`](migration-runbook.md)
- 备份恢复基线：[`backup-and-restore.md`](backup-and-restore.md)
- 原有发布检查：[`deployment-checklist.md`](deployment-checklist.md)

当前五主题 OPS 均处于 review/未准入；真实生产发布、破坏性迁移、备份恢复和回滚演练均未执行。证据模板位置：`evidence/finance/<release-id>/`。
