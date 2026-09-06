# ADR-0028：备份定时、保留、异地副本与恢复演练

- 状态：accepted
- 决策日期：2026-08-29
- 生效版本：v1.0.0
- 决策来源：BOSS 对 `open-issues.md` 项 9 的确认
- 关联 ADR：ADR-0014、ADR-0026

## 决策
- 生产备份由系统级 `cron` 或宝塔计划任务负责，必须明确唯一实际执行者，禁止重复配置。
- 每日 04:00（Asia/Shanghai）执行 PostgreSQL 全量 custom archive 备份。
- 备份文件使用时间戳命名，并生成 SHA-256 校验文件；记录数据库、版本、起止时间、文件大小和结果。
- 本机保留最近 7 天；异地/独立存储保留最近 30 天；轮转不得删除最近一次成功备份。
- 备份成功后才复制异地副本；远端 checksum 校验失败或复制失败必须告警，且不得删除本地备份。
- 生产服务器单机磁盘不得作为唯一备份位置。
- 每月在独立环境执行恢复演练，不得覆盖生产库；使用 `pg_restore`，验证结构、索引、约束、关键余额/流水和应用连通性，并记录完整结果。
- 发布前必须验证最近成功备份不超过 24 小时、文件存在且大小合理、checksum 正确、最近恢复演练未失败；任一不满足则禁止迁移和启动新版本。
- 备份生成/复制、部署检查、恢复演练和监控告警职责分离；`deploy.sh` 不得替代定时备份体系。

## 影响与迁移
更新 OPS、部署清单、备份恢复 Runbook、监控告警和恢复测试；补充定时任务唯一性、7/30 天轮转、异地 checksum、恢复演练和发布前检查证据。未完成真实任务和恢复演练前不得标记备份门禁通过。

## 关联文件
- `docs/08-operations-and-deployment/backup-and-restore.md`
- `docs/08-operations-and-deployment/deployment-checklist.md`
- `docs/00-index/open-issues.md`
- `audit/08-deployment/document-decision-log.md#dec-028`
