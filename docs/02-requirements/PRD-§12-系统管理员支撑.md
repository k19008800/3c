# PRD §12 系统管理员支撑（运维 / 审计 / 调度 / 变更）

> 品牌：**浩寅云**　|　代码基线：2026-10-03 工作区
> 状态图例：✅已实现｜🟡部分实现｜❌未实现（规划中）
> 路径权威：以 `api/src/routes/admin-{ops,sys-cache,settings,permissions}.ts` 等实际注册为准。

---

## 一、功能清单

| 编号 | 功能点 | 实际端点 / 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 12.1 | 操作审计控制台 | `admin-tickets.ts`：`GET /api/v1/admin/audit-logs`；`admin-risk-missing.ts`：`GET /admin/audit/permissions`；页面 AdminAuditLogPage / AdminPermissionAuditPage | ✅ | 审计日志 + 权限审计双视图 |
| 12.2 | 数据库管理面板 | `admin-support-missing.ts`：`GET /admin/sys/db/tables`、`POST /admin/sys/db/query`；AdminSysDbPage | ✅ | 表清单 + 查询面板 |
| 12.3 | 缓存管理控制台 | `admin-sys-cache.ts`：`GET /admin/sys/cache/keys`、`DELETE /key`、`POST /flush`、`GET /temp-stats`、`GET/PUT /config`；AdminSysCachePage | ✅ | key 列举/删除/清空/临时统计/配置 |
| 12.4 | **任务调度中心** | 后端 `services/` 有定时任务（task-poller / retention / pre-consume / model-health-aggregator / price-notification / temp-cleanup），但 **无 admin 端点、无页面** | ❌ | 调度对管理员黑盒：无任务状态查看 / 手动触发 / 暂停调度端点与页面 |
| 12.5 | 在线日志查看器 | `admin-ops.ts`：`GET /admin/sys/logs`、`POST /admin/sys/logs/read`；AdminSysLogsPage | ✅ | 日志列表 + 标记已读 |
| 12.6 | 健康检查大屏（数据驾驶舱） | `AdminCockpitPage.tsx` + `health.ts`；`GET /health` | 🟡 | 网关/DB/缓存/供应商连通为真实探针；实时用户/实时消费/模型运营为**演示数据**（页面注释明示后端未提供） |
| 12.7 | **变更计划与沙箱预览** | 全代码库无 sandbox / change-plan 路由 | ❌ | 沙箱→生产审批闭环零实现（与 §31.3 配置沙箱同源缺失） |
| 12.8 | 系统升级与版本管理 | `admin-ops.ts`：`GET /admin/sys/version`、`GET /admin/sys/migrations`；AdminSysVersionPage | 🟡 | **只读**版本/迁移记录查看；无版本对比 / 一键升级 / 回滚 |
| 12.9 | 权限矩阵集成 | `admin-permissions.ts`：`GET /admin/roles/permissions/list` | ✅ | 权限点清单端点 |
| 12.10 | 操作撤销机制 | `admin-ops.ts`：`GET/PUT /admin/undo/config`、`GET /admin/undo/records`、`POST /admin/undo/:id/execute`；AdminUndoPage | ✅ | 通用操作撤销记录与执行 |
| 12.11 | Webhook 重投 | `admin-ops.ts`：`GET/PUT /admin/webhook-retry[/:id]` | ✅ | 失败推送重投 |
| 12.12 | 系统配置 / 性能配置 | `admin-settings.ts`（site/rate-limit/security/features/api/billing/smtp 分项）、`admin-ops.ts` `GET/PUT /admin/performance` | ✅ | — |

---

## 二、关键架构

- **运维能力以「只读观测 + 受控操作」为主**：审计/DB/缓存/日志/版本均为观测面；写操作（清缓存、撤销执行、改配置）走权限点 + 操作 2FA。
- **定时任务在 services 层后台运行**（task-poller/retention/model-health 等），但目前**没有对管理员暴露的调度面**——任务在跑却不可见、不可控。
- **健康大屏混合数据**：基础设施探针为真实 `/health`，业务实时指标为前端演示占位，需后端补真实指标端点才能转 ✅。
- **变更/沙箱是纯文档项**：ref-12.7、ref-31.3 有完整设计但代码零落地，如实标注为规划中，不得写成已部署。

---

## 三、未实现 / 规划中（❌）

1. **12.4 任务调度中心**：需补 `/admin/scheduler/jobs`（列表/状态/手动触发/暂停）端点 + 页面，把现有后台定时任务纳管。
2. **12.7 变更计划与沙箱预览**：配置变更先在沙箱 dry-run、审批后再生效，整条链路未建。
3. **12.6 真实业务实时指标**：实时用户/实时消费/模型运营待后端补端点。
4. **12.8 升级执行/回滚**：当前仅只读版本与迁移记录。

> 关联章节：§4 管理后台（看板/用户/财务/风控）、§30 权限管理（角色/权限点/审计）。本章聚焦「系统级运维支撑」。
