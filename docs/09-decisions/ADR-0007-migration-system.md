# ADR-0007：数据库迁移体系与执行顺序

- 状态：accepted
- 决策日期：2026-08-29
- 生效版本：v1.0.0
- 决策来源：DEC-007

## 决策
- 先执行 Drizzle journal `0000–0016`，再按编号执行手写迁移 `0017–0032`。
- `_3cloud_manual_migrations` 记录编号、文件名、checksum、执行时间、状态、错误和耗时。
- 任一迁移失败立即停止，不启动 PM2，不执行后续迁移。
- 生产迁移前必须有真实且可恢复的备份。
- 已成功迁移安全跳过，checksum 变化必须报警。
- 禁止自动删除业务数据；破坏性变更需单独审批和恢复方案。
- 全部迁移及结构校验通过后才启动 API 与 Portal。

## 关联
`audit/08-deployment/document-decision-log.md#dec-007`
