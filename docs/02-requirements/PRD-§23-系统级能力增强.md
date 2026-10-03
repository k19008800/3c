# §23 系统级能力增强

- 品牌：浩寅云
- 代码基线：git HEAD `91f62d3`（2026-10-03）
- 权威源：`api/src/routes/{admin-tickets,admin-ops,admin-i18n,me-gap}.ts`、`web-console/src/components/`
- 状态图例：✅ 已实现 / 🟡 部分实现 / ❌ 未实现（规划中） / 📄 文档超前

## 23.1 功能清单

| 编号 | 能力 | 代码落点 | 状态 | 差距说明 |
|---|---|---|---|---|
| 23.1.1 | 用户端操作日志 | `me-gap.ts`：`GET /me/login-history` | 🟡 | 登录历史有；通用 `me/operation-logs` 聚合端点未独立注册 |
| 23.1.2 | 管理后台审计日志列表 | `admin-tickets.ts`：`GET /admin/audit-logs`（keyword/action） | ✅ | |
| 23.1.3 | 审计详情 / 导出 | — | ❌ | 无 `/:id` 详情、无导出 |
| 23.2 | 全局搜索（Cmd+K） | — | ❌ | 无全局搜索端点/组件 |
| 23.3 | 快捷键体系 | — | ❌ | |
| 23.4 | i18n 国际化 | `admin-i18n.ts` + `AdminI18nPage.tsx`；Portal 词典 `/public/i18n/entries` | ✅ | 管理端词条管理页已上线 |
| 23.5 | 移动端适配 | — | 📄 | 前端响应式范畴，无独立端点，未做响应式验证 |
| 23.6 | 数据迁移状态查询 | `admin-ops.ts`：`GET /admin/sys/migrations` | 🟡 | 仅读取本地迁移记录；迁移执行走命令行 `pnpm db:migrate:manual`，无在线触发/断点续传/完整性校验 API |
| 23.7 | 统一错误响应格式 | `api/src/lib/errors.ts`（AppError） | ✅ | 编码规范级统一抛出，见 §14 |
| 23.8 | 公共组件库 | `web-console/src/components/` 仅 6 个业务弹窗 | 🟡 | 无 Button/Modal/Table/StatCard/TrendChart/StatusTag 基础组件沉淀，页面内联 Tailwind |
| 23.9 | 通用撤销机制 | `admin-ops.ts`：`GET/PUT /admin/undo/config`、`GET /undo/records`、`POST /undo/:id/execute` | ✅ | 已落地 |
| 23.10 | 运维工具（DB 表查询/版本/日志） | `admin-ops.ts`：`/admin/sys/db/{tables,query}`、`/sys/version`、`/sys/logs`；`admin-sys-cache.ts` | ✅ | 仅限超管 |

## 23.2 关键架构

- 审计日志为动作级列表（keyword/action 过滤），未做 diff 级字段变更记录；撤销机制（undo）是独立的通用补偿通道，非审计回滚。
- 数据迁移完全由离线命令驱动，在线只读——这是有意的安全设计，重写 PRD 时不改判为缺陷，仅标注"无在线触发"。

## 23.3 未实现项

| 优先级 | 事项 |
|---|---|
| P1 | 审计详情与导出、全局搜索 Cmd+K |
| P2 | 基础组件库沉淀（StatCard/TrendChart/StatusTag 优先） |
| P2 | 移动端响应式验证 |
