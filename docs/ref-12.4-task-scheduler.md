# 深化参考：§12.4 任务调度中心

> **对应**：[`PRD-系统管理员支撑.md`](PRD-系统管理员支撑.md) §12.4
> **关联**：[`ref-12.3-cache-manager.md`](ref-12.3-cache-manager.md)、[`ref-5.2-billing.md`](ref-5.2-billing.md)、[`ref-12.6-health-dashboard.md`](ref-12.6-health-dashboard.md)
> **优先级**：P1 | **状态**：需求文档（待开发）
> **最后更新**：2026-07-30

---

## 概述

系统依赖大量定时任务：每日/月账单结算、数据备份、告警检查、对账、数据清理、日报推送等。当前这些任务可能在系统层由 cron 分散管理，缺少统一的可视化管理界面和监控。

**核心价值**：统一管理所有定时任务，支持查看状态、手动触发、执行历史、失败告警，运维人员无需登录服务器操作 cron。

---

## 功能模块

### 1. 任务列表

展示所有定时任务，包含以下信息：

| 字段 | 说明 |
|------|------|
| 任务名称 | 如"每日账单结算" |
| 任务类型 | `billing_daily` / `billing_monthly` / `backup` / `alert_check` / `reconciliation` / `data_cleanup` / `daily_report` |
| 调度表达式 | Cron 表达式，如 `0 2 * * *`（每天凌晨 2 点）|
| 下次执行 | 基于当前时间的下次执行时间 |
| 上次执行 | 最近一次执行时间 |
| 上次状态 | ✅ 成功 / ❌ 失败 / ⏳ 执行中 |
| 启用状态 | 启用/禁用开关 |
| 操作 | [触发] [查看详情] [编辑] |

**任务类型说明**：

| 任务类型 | 说明 | 默认调度 |
|----------|------|---------|
| billing_daily | 每日账单汇总 | 每天 02:00 |
| billing_monthly | 月度账单结算 | 每月 1 日 03:00 |
| backup | 数据库/文件备份 | 每天 04:00 |
| alert_check | 告警规则检查 | 每 5 分钟 |
| reconciliation | 对账处理 | 每天 05:00 |
| data_cleanup | 数据清理 | 每天 03:00 |
| daily_report | 日报推送 | 每天 09:00 |

**列表 UI 示意**：

```
┌────────┬──────────┬────────────┬──────────┬────────┬──────┬──────────┐
│ 任务名  │ 类型      │ 调度表达式  │ 上次执行  │ 上次  │ 启用 │ 操作     │
│        │          │            │          │ 状态   │      │          │
├────────┼──────────┼────────────┼──────────┼────────┼──────┼──────────┤
│ 每日   │ billing  │ 0 2 * * * │ 07-30    │ ✅     │ 开启  │ [触发]   │
│ 账单   │ _daily   │            │ 02:00    │ 成功   │      │ [详情]   │
│ 数据   │ backup   │ 0 4 * * * │ 07-30    │ ❌     │ 开启  │ [触发]   │
│ 备份   │          │            │ 04:00    │ 失败   │      │ [详情]   │
│ 告警   │ alert_   │ */5 * * * │ 07-30    │ ✅     │ 开启  │ [触发]   │
│ 检查   │ check    │            │ 15:25    │ 成功   │      │ [详情]   │
└────────┴──────────┴────────────┴──────────┴────────┴──────┴──────────┘
```

### 2. 手动触发 / 启用禁用

| 操作 | 说明 | 使用场景 |
|------|------|---------|
| 手动触发 | 立即执行一次任务，记录在 `taskRunHistory` 中 | 修复后重试失败任务、非调度时间执行 |
| 启用 | 任务按 cron 表达式定时执行 | 维护完成后恢复 |
| 禁用 | 停止任务调度，不执行 | 维护窗口、已知故障避免执行 |

- 手动触发不影响原有调度计划
- 禁用后手动触发依然可用
- 禁用期间跳过调度执行，恢复后不再补执行已错过的调度

### 3. 执行历史

任务详情页展示执行历史：

| 字段 | 说明 |
|------|------|
| 开始时间 | 任务开始执行时间 |
| 结束时间 | 任务完成时间（失败则为停止时间）|
| 耗时 | 结束 - 开始 |
| 状态 | ✅ 成功 / ❌ 失败 / ⏳ 执行中 |
| 错误信息 | 失败时的错误详情 |
| 触发方式 | `scheduled` / `manual` |

**历史记录 UI**：

```
┌──────┬──────┬──────┬──────┬────────┬──────────┬────────┐
│ 开始  │ 结束  │ 耗时  │ 状态  │ 错误    │ 触发方式  │ 结果   │
│      │      │      │      │        │          │        │
├──────┼──────┼──────┼──────┼────────┼──────────┼────────┤
│ 07-30 │ 07-30 │ 12s  │ ✅   │ -      │ scheduled │ [查看] │
│ 02:00 │ 02:12 │      │      │        │          │        │
│ 07-29 │ 07-29 │ 2m   │ ❌   │ 超时    │ scheduled │ [查看] │
│ 02:00 │ 02:02 │      │      │        │          │        │
│ 07-29 │ 07-29 │ 30s  │ ✅   │ -      │ manual   │ [查看] │
│ 14:00 │ 14:30 │      │      │        │          │        │
└──────┴──────┴──────┴──────┴────────┴──────────┴────────┘
```

- 默认按时间倒序，最近在上
- 支持按时间范围筛选
- 支持按状态筛选

### 4. 任务依赖关系配置

某些任务需要在其他任务完成后执行：

| 依赖场景 | 说明 |
|----------|------|
| billing_monthly 依赖 billing_daily | 月度结算需依赖每日汇总数据 |
| daily_report 依赖 billing_daily | 日报需依赖当日账单数据 |
| reconciliation 依赖 billing_daily | 对账需当日数据完整 |

**配置方式**：

```
任务: 月度账单结算
依赖:
  - 任务: 每日账单结算
    条件: 本月所有日账单已执行成功
    失败策略: 等待（重试检查） / 跳过依赖执行
```

| 依赖策略 | 行为 |
|----------|------|
| 等待 | 前置任务未完成时等待，间隔 5 分钟检查一次，超时 30 分钟后标记失败 |
| 跳过 | 前置任务未完成时跳过依赖检查直接执行 |

### 5. 连续失败告警

| 触发条件 | 告警方式 | 说明 |
|----------|---------|------|
| 同一任务连续失败 ≥ 3 次 | 系统通知 | 通知管理员账号 |
| 同一任务连续失败 ≥ 5 次 | 系统通知 + 邮件 | 通知管理员 + 备用联系人 |
| 核心任务（billing/backup）首次失败 | 系统通知 + 邮件 | 即时通知 |

- 连续失败计数器在成功后重置
- 核心任务失败即时告警，非核心任务按连续失败次数升级告警
- 告警内容包含：任务名称、失败次数、最新错误信息、最后成功时间

---

## 数据表定义

### scheduledTasks（定时任务）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| name | varchar(100) | 任务名称 |
| description | text | 任务描述 |
| taskType | enum | `billing_daily` / `billing_monthly` / `backup` / `alert_check` / `reconciliation` / `data_cleanup` / `daily_report` |
| cronExpr | varchar(50) | Cron 表达式 |
| timeoutSeconds | integer | 超时时间（秒）|
| maxRetries | integer | 最大重试次数 |
| retryInterval | integer | 重试间隔（秒）|
| enabled | boolean | 是否启用 |
| lastRunAt | timestamp | 上次执行时间 |
| lastRunStatus | varchar(20) | 上次状态 |
| lastRunError | text | 上次错误信息 |
| createdAt | timestamp | 创建时间 |
| updatedAt | timestamp | 更新时间 |

### taskRunHistory（执行历史）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| taskId | integer | 关联任务 ID |
| startedAt | timestamp | 开始时间 |
| finishedAt | timestamp | 结束时间 |
| duration | integer | 耗时（毫秒）|
| status | varchar(20) | `success` / `failed` / `running` |
| error | text | 错误信息 |
| result | jsonb | 执行结果（JSON）|
| triggeredBy | varchar(20) | `scheduled` / `manual` |
| createdAt | timestamp | 记录创建时间 |

---

## API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/v1/admin/tasks` | 任务列表 | 管理员 |
| `GET` | `/api/v1/admin/tasks/:id` | 任务详情 | 管理员 |
| `PATCH` | `/api/v1/admin/tasks/:id` | 更新任务配置 | 管理员 |
| `POST` | `/api/v1/admin/tasks/:id/trigger` | 手动触发 | 管理员 |
| `POST` | `/api/v1/admin/tasks/:id/toggle` | 启用/禁用 | 管理员 |
| `GET` | `/api/v1/admin/tasks/:id/history` | 执行历史 | 管理员 |

---

## 前端组件 Props

```tsx
// 任务列表
interface TaskListProps {
  tasks: TaskSummary[];
  onTrigger: (taskId: number) => void;
  onToggle: (taskId: number) => void;
  onViewDetail: (taskId: number) => void;
}

interface TaskSummary {
  id: number;
  name: string;
  taskType: string;
  cronExpr: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: 'success' | 'failed' | 'running' | null;
  enabled: boolean;
}

// 任务详情
interface TaskDetailProps {
  task: TaskDetail;
  onTrigger: () => void;
  onToggle: () => void;
  onEdit: () => void;
}

// 执行历史
interface TaskRunHistoryProps {
  runs: TaskRunSummary[];
  taskId: number;
  onFilter: (filter: TaskRunFilter) => void;
}

interface TaskRunSummary {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  duration: number | null;
  status: 'success' | 'failed' | 'running';
  error: string | null;
  triggeredBy: 'scheduled' | 'manual';
}

// 任务编辑表单
interface TaskEditorProps {
  initialData: Partial<TaskConfig>;
  onSave: (data: TaskConfig) => void;
}

interface TaskConfig {
  cronExpr: string;
  timeoutSeconds: number;
  maxRetries: number;
  retryInterval: number;
  enabled: boolean;
}

// 任务依赖配置
interface TaskDependencyProps {
  taskId: number;
  dependecies: Dependecy[];
  onAdd: (dependecy: DependecyInput) => void;
  onRemove: (dependecyId: number) => void;
}

interface Dependecy {
  dependetTaskId: number;
  dependetTaskName: string;
  strategy: 'wait' | 'skip';
}

// 连续失败告警配置
interface TaskAlertConfigProps {
  consecutveFailThreshold: number;
  alertMethods: string[];
  isCoreTask: boolean;
  onSave: (config: AlertConfigInput) => void;
}
```

---

## 边界条件

| 场景 | 处理方式 |
|------|---------|
| 任务超时（超过 timeoutSeconds）| 强制终止任务，记录失败状态，"超时"错误信息 |
| 任务执行中再次触发 | 拒绝请求，提示"任务正在执行中，请稍后重试" |
| 手动触发时任务已禁用 | 允许触发执行，但下次调度仍按禁用状态跳过 |
| 重试耗尽仍失败 | 记录最终失败，触发连续失败告警逻辑 |
| 依赖任务不存在（已删除）| 跳过该依赖检查，记录警告日志 |
| 依赖任务循环依赖 | 配置时检测循环依赖，提示"检测到循环依赖" |
| cron 表达式无效 | 配置时校验，提示错误并禁止保存 |
| 并发执行限制 | 同一时间同一任务只能有一个执行实例，防止重复执行 |

---

## 关联模块

| 模块 | 关联方式 |
|------|---------|
| §5.2 计费系统 | billing_daily / billing_monthly 驱动计费结算 |
| §12.3 缓存管理 | 定时清理缓存数据 |
| §12.6 健康监控 | alert_check 检查系统健康指标 |
| §5.4 告警规则 | 连续失败告警触发告警规则 |
| §5.1 路由 | 日报推送定时任务 |
| §4.4 财务结算 | reconciliation 对账处理 |

---

### [?] 页面帮助
**页面名称**：任务调度中心
**核心操作**：查看任务列表和状态 → 手动触发重试失败任务 → 查看执行历史 → 配置任务依赖和告警
**注意事项**：手动触发不影响原有调度计划；禁用后任务不再自动执行但仍可手动触发；核心任务失败将即时通知管理员

### [?] 按钮级帮助对照表
| 按钮/操作 | 帮助说明 |
|----------|---------|
| 手动触发 | 立即执行一次任务，适用于修复后重试或非调度时间执行 |
| 启用/禁用 | 切换任务的自动调度状态（禁用后停止自动执行）|
| 查看详情 | 查看任务配置、依赖关系、告警设置和执行历史 |
| 编辑配置 | 修改 cron 表达式、超时时间、重试策略等任务参数 |
| 查看结果 | 查看单次执行的结果数据（JSON 格式）|