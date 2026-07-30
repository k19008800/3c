# 深化参考：§12.8 版本管理

> **对应**：[`PRD-系统管理员支撑.md`](PRD-系统管理员支撑.md) §12.8
> **关联**：[`ref-12.7-change-plan.md`](ref-12.7-change-plan.md)、[`ref-4.8-system-config.md`](ref-4.8-system-config.md)、[`ref-12.4-task-scheduler.md`](ref-12.4-task-scheduler.md)
> **优先级**：P1 | **状态**：需求文档（待开发）
> **最后更新**：2026-07-30

---

## 概述

系统配置（定价、路由、速率限制、通知等）的变更频繁且敏感，没有版本控制的情况下难以追踪"谁在什么时候改了什么"，回滚时需要人工回忆之前的配置值。

**核心价值**：对系统关键配置进行版本化管理——每次变更加快照，支持差异对比、一键部署、一键回滚，配置变更可追溯、可回退。

---

## 功能模块

### 1. 版本记录

每次配置变更创建一条版本记录，包含完整快照：

| 字段 | 说明 |
|------|------|
| 版本号 | 自动生成，如 `CFG-260728-001` |
| 类别 | `system_config` / `pricing` / `routing` / `rate_limit` / `notification` |
| 描述 | 变更说明 |
| 变更内容 | 字段级 diff [{field, oldValue, newValue}] |
| 配置快照 | 该类别的完整配置 JSON |
| 状态 | `active` / `inactive` / `rolled_back` |
| 部署时间 | 部署为生效版本的时间 |
| 部署人 | 执行部署操作的用户 |
| 父版本 | 基于哪个版本创建的（用于回滚溯源）|

**版本号生成规则**：`CFG-YYYYMMDD-NNN`，其中 NNN 为当日序号（001 开始）。

**版本列表 UI**：

```
┌────────┬──────────┬────────────┬──────────┬────────┬──────────┐
│ 版本号  │ 类别      │ 描述        │ 状态      │ 创建时间 │ 操作      │
├────────┼──────────┼────────────┼──────────┼────────┼──────────┤
│ CFG-   │ pricing  │ 调整       │ 🟢 生效   │ 07-28  │ [详情]   │
│ 260728 │          │ DeepSeek   │          │ 14:00  │ [回滚]   │
│ -001   │          │ 价格       │          │        │          │
│ CFG-   │ routing  │ 新增       │ ⚪ 未生效  │ 07-27  │ [详情]   │
│ 260727 │          │ Qwen-Max   │          │ 10:00  │ [部署]   │
│ -002   │          │ 路由       │          │        │ [回滚]   │
│ CFG-   │ system_  │ 修改       │ 🔴 已回滚  │ 07-26  │ [详情]   │
│ 260726 │ config   │ API 超时   │          │ 16:00  │          │
│ -001   │          │ 配置       │          │        │          │
└────────┴──────────┴────────────┴──────────┴────────┴──────────┘
```

### 2. 版本对比

两个版本间 diff 可视化展示：

```
对比: CFG-260727-002 (新) ↔ CFG-260726-001 (旧)

模型定价配置

🔴 删除:
  - model: "gpt-4o"
    inputPrice: 15.00
    outputPrice: 60.00

🟢 新增:
  - model: "qwen-max"
    inputPrice: 2.00
    outputPrice: 6.00

🔵 修改:
  model: "deepseek-v4"
    inputPrice: 0.50 → 0.45
    outputPrice: 2.00 → 1.80
```

| 对比方式 | 说明 |
|----------|------|
| 任意两个版本对比 | 选择两个版本号，展示差异 |
| 当前生效 vs 指定版本 | 默认比较当前生效版本和选中版本 |
| 差异展示 | 新增（绿色）/ 删除（红色）/ 修改（蓝色）|

### 3. 版本部署

将指定版本部署为当前生效版本：

| 部署步骤 | 说明 |
|----------|------|
| 选择版本 | 从版本列表中选择要部署的版本 |
| 确认影响 | 系统自动计算受影响的服务/模块 |
| 确认部署 | 确认后立即生效 |
| 部署结果 | 成功/失败，失败时自动回滚到上一个生效版本 |

**部署规则**：
- 同一类别同一时间只能有一个 `active` 版本
- 部署后该版本状态变更为 `active`，原生效版本变更为 `inactive`
- 部署操作记录 `deployedAt` 和 `deployedBy`
- 部署成功后触发相关服务的热重载

### 4. 版本回滚

| 回滚方式 | 说明 |
|---------|------|
| 回滚到上一版本 | 自动找到当前 `active` 版本的上一个版本并部署 |
| 回滚到指定版本 | 选择任意历史版本部署 |
| 回滚确认 | 确认回滚前展示两版本 diff 供参考 |

回滚后：
- 原 `active` 版本变更为 `rolled_back`
- 目标版本变更为 `active`
- 新创建一条回滚版本记录（`parentVersionId` 指向回滚源版本）

### 5. 版本发布日历

日历视图展示配置版本发布历史：

```
2026年7月 ┌────┬────┬────┬────┬────┬────┬────┐
          │ 一  │ 二  │ 三  │ 四  │ 五  │ 六  │ 日  │
          ├────┼────┼────┼────┼────┼────┼────┤
          │    │    │  1 │  2 │  3 │  4 │  5 │
          │    │    │    │    │    │    │    │
          ├────┼────┼────┼────┼────┼────┼────┤
          │  6 │  7 │  8 │  9 │ 10 │ 11 │ 12 │
          │    │    │    │    │定价│    │    │
          │    │    │    │    │更新│    │    │
          ├────┼────┼────┼────┼────┼────┼────┤
          │ 26 │ 27 │ 28 │ 29 │ 30 │ 31 │    │
          │    │路由│定价│    │    │    │    │
          │    │更新│更新│    │    │    │    │
          └────┴────┴────┴────┴────┴────┴────┘
```

- 每个版本以颜色标签展示在部署日期上
- 颜色标识类别：`system_config` / `pricing` / `routing` / `rate_limit` / `notification`

### 6. 配置环境区分

支持多环境版本管理：

| 环境 | 版本独立 | 说明 |
|------|---------|------|
| 开发 (dev) | ✅ 独立版本链 | 可随意变更 |
| 测试 (test) | ✅ 独立版本链 | 变更后需验证 |
| 生产 (prod) | ✅ 独立版本链 | 变更需审批（与 §12.7 变更计划联动）|

- 不同环境的版本号不冲突
- 支持从开发环境复制配置到测试/生产环境（带版本记录）
- 生产环境版本部署需要关联 §12.7 变更计划

---

## 数据表定义

### configVersions（配置版本）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| versionNo | varchar(20) | 版本号，如 `CFG-260728-001`，唯一 |
| category | varchar(30) | 类别：`system_config` / `pricing` / `routing` / `rate_limit` / `notification` |
| config | jsonb | 完整配置快照 |
| changes | jsonb | 变更列表 [{field, oldValue, newValue}] |
| description | varchar(200) | 变更说明 |
| status | varchar(20) | 状态：`active` / `inactive` / `rolled_back`，默认 `inactive` |
| deployedAt | timestamp | 部署时间 |
| deployedBy | integer | 部署人 ID |
| parentVersionId | integer | 父版本 ID（用于回滚溯源）|
| createdBy | integer | 创建人 ID |
| createdAt | timestamp | 创建时间 |

---

## API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `POST` | `/api/v1/admin/config-versions` | 创建配置版本 | 管理员 |
| `GET` | `/api/v1/admin/config-versions` | 版本列表 | 管理员 |
| `GET` | `/api/v1/admin/config-versions/:id` | 版本详情 | 管理员 |
| `GET` | `/api/v1/admin/config-versions/:id/diff` | 与当前生效版本对比差异 | 管理员 |
| `POST` | `/api/v1/admin/config-versions/:id/deploy` | 部署版本 | 管理员 |
| `POST` | `/api/v1/admin/config-versions/:id/rollback` | 回滚到指定版本 | 管理员 |
| `GET` | `/api/v1/admin/config-versions/active` | 当前生效版本 | 管理员 |

---

## 前端组件 Props

```tsx
// 版本列表
interface ConfigVersionListProps {
  versions: ConfigVersionSummary[];
  categoryFilter?: string;
  environment: 'dev' | 'test' | 'prod';
  onView: (id: number) => void;
  onDeploy: (id: number) => void;
  onRollback: (id: number) => void;
  onCreate: () => void;
}

interface ConfigVersionSummary {
  id: number;
  versionNo: string;
  category: string;
  description: string;
  status: 'active' | 'inactive' | 'rolled_back';
  createdAt: string;
  deployedAt: string | null;
  deployedBy: string | null;
}

// 创建配置版本
interface ConfigVersionCreatorProps {
  category: string;
  currentConfig: object; // 当前配置值
  onSave: (data: ConfigVersionInput) => void;
}

interface ConfigVersionInput {
  category: string;
  config: object;
  description: string;
}

// 版本对比
interface ConfigVersionDiffProps {
  versionA: ConfigVersionDetail;
  versionB: ConfigVersionDetail;
  diffData: DiffEntry[];
}

interface DiffEntry {
  field: string;
  type: 'added' | 'removed' | 'modified';
  oldValue?: any;
  newValue?: any;
  path: string; // JSON path
}

// 版本部署确认
interface DeployConfirmProps {
  version: ConfigVersionDetail;
  activeVersion: ConfigVersionDetail | null;
  diffSummary: string; // 变更概要
  affectedServices: string[];
  onConfirm: (options?: DeployOptions) => void;
  onCancel: () => void;
}

interface DeployOptions {
  notify: boolean; // 是否通知相关人员
  createChangePlan: boolean; // 生产环境：是否需要创建变更计划
}

// 版本回滚确认
interface RollbackConfirmProps {
  targetVersion: ConfigVersionDetail;
  currentVersion: ConfigVersionDetail;
  diffPreview: DiffEntry[];
  onConfirm: () => void;
  onCancel: () => void;
}

// 版本发布日历
interface ConfigVersionCalendarProps {
  events: CalendarEvent[];
  year: number;
  month: number;
  onEventClick: (versionId: number) => void;
}

interface CalendarEvent {
  id: number;
  versionNo: string;
  date: string;
  category: string;
  description: string;
}

// 环境切换
interface EnvironmentSelectorProps {
  environments: { key: string; label: string }[];
  active: string;
  onSwitch: (env: string) => void;
}
```

---

## 边界条件

| 场景 | 处理方式 |
|------|---------|
| 首次创建版本（无当前生效版本）| 创建后自动部署为 `active` 版本 |
| 同一类别有两个 active 版本 | 不允许，部署新版本时自动将当前 active 变更为 inactive |
| 版本回滚时目标版本已不存在 | 提示"目标版本不存在，请选择其他版本" |
| 并发部署同一类别 | 加锁处理，后发起的部署等待前一个完成 |
| 部署后配置未生效 | 记录部署成功但后续热重载失败，标记为"部署成功，配置可能未生效" |
| 回滚后再次回滚 | 允许，每次回滚创建新版本记录，形成完整版本链 |
| 创建版本时配置为空 | 校验配置快照不为空，若为空提示"配置快照不能为空" |
| 配置版本数据量过大 | 分页加载，默认每页 20 条 |
| 环境切换 | 不同环境的版本数据完全隔离，URL 路径携带环境参数 |

---

## 关联模块

| 模块 | 关联方式 |
|------|---------|
| §12.7 变更计划 | 生产环境版本部署需关联变更计划 |
| §4.8 系统配置 | 配置版本管理的操作对象 |
| §12.4 任务调度 | 部署后触发相关服务的热重载 |
| §12.6 健康监控 | 部署前后健康指标对比 |
| §4.6 安全审计 | 版本创建/部署/回滚均记录审计日志 |

---

### [?] 页面帮助
**页面名称**：版本管理
**核心操作**：创建配置版本（自动记录 diff）→ 版本列表查看 → 对比差异 → 部署生效 → 回滚到历史版本
**注意事项**：同一类别同时只能有一个生效版本；部署新版本时自动将旧版本设为未生效；生产环境部署建议关联变更计划审批；回滚操作会创建新的版本记录而非修改旧版本

### [?] 按钮级帮助对照表
| 按钮/操作 | 帮助说明 |
|----------|---------|
| 创建版本 | 基于当前配置创建快照版本，自动记录与上一版本的差异 |
| 查看差异 | 对比任意两个版本的配置差异，新增/删除/修改分别用颜色标识 |
| 部署版本 | 将指定版本部署为当前生效版本，同一类别旧版本自动变为未生效 |
| 回滚版本 | 回滚到上一个版本或指定版本，回滚后创建新的版本记录 |
| 版本详情 | 查看版本完整配置快照、变更列表和部署信息 |
| 环境切换 | 在开发/测试/生产环境之间切换，各环境版本独立管理 |
| 版本发布日历 | 按日历视图查看各版本的部署历史 |