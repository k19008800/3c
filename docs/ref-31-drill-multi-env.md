# 深化参考：§31 供应商故障演练与多环境管理

> **对应**：[`SPEC-§31-供应商故障演练与多环境管理.md`](SPEC-§31-供应商故障演练与多环境管理.md)
> **关联**：[`ref-5.1-routing.md`](ref-5.1-routing.md)、[`ref-4.8-system-config.md`](ref-4.8-system-config.md)
> **优先级**：P1 | **状态**：需求文档（待开发）
> **最后更新**：2026-07-31

---

## 概述

供应商宕机、配置错误、环境差异等问题的处理长期依赖人工应急。本模块提供提前验证能力：供应商故障演练、多环境配置同步、配置沙箱预览。

---

## §31.1 供应商故障演练（已实现）

> ⚠️ 已在先前开发中完成基础实现：后端 5 API + 前端管理页 + Redis 演练注入。

### 数据表结构

```typescript
// drill_scenarios — 演练场景定义
export const drillScenarios = pgTable("drill_scenarios", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  type: varchar("type", { length: 30 }).notNull(),
    // 'vendor_down' | 'timeout' | 'error_response' | 'empty_response' | 'latency_spike'
  description: text("description"),
  configTemplate: text("config_template"),
    // JSON: 场景参数模板（延迟时间、错误码、错误率等）
  isBuiltin: boolean("is_builtin").default(false), // 系统内置
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// drill_executions — 演练执行记录
export const drillExecutions = pgTable("drill_executions", {
  id: serial("id").primaryKey(),
  scenarioId: integer("scenario_id").notNull().references(() => drillScenarios.id),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id),
  executedBy: integer("executed_by").references(() => users.id),
  status: varchar("status", { length: 20 }).default("running"),
    // 'running' | 'completed' | 'failed' | 'cancelled'
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at"),
  durationMinutes: integer("duration_minutes").notNull(),
  results: text("results"),
    // JSON: 演练结果摘要（环节通过/失败、自动恢复耗时、告警触发情况）
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// drill_execution_steps — 演练执行步骤
export const drillExecutionSteps = pgTable("drill_execution_steps", {
  id: serial("id").primaryKey(),
  executionId: integer("execution_id").notNull().references(() => drillExecutions.id),
  stepName: varchar("step_name", { length: 100 }).notNull(),
  stepOrder: integer("step_order").notNull(),
  action: varchar("action", { length: 50 }),
    // 'inject_failure' | 'check_breaker' | 'check_fallback' | 'check_alert' | 'recover'
  expected: text("expected"),   // 预期结果
  actual: text("actual"),       // 实际结果
  passed: boolean("passed"),
  latencyMs: integer("latency_ms"),
  logs: text("logs"),
  createdAt: timestamp("created_at").defaultNow(),
});
```

### API 接口

```
POST   /api/v1/admin/drills                       — 创建并启动演练
  body: { scenarioType, vendorId, durationMinutes, params? }
POST   /api/v1/admin/drills/:id/cancel             — 取消演练（提前结束）
GET    /api/v1/admin/drills                        — 演练列表
  params: { status?, vendorId?, dateFrom?, dateTo?, page, limit }
GET    /api/v1/admin/drills/:id                    — 演练详情（含步骤结果）
GET    /api/v1/admin/drills/scenarios              — 演练场景模板列表

// 演练场景管理端
POST   /api/v1/admin/drills/scenarios             — 创建自定义场景
PUT    /api/v1/admin/drills/scenarios/:id          — 编辑场景
DELETE /api/v1/admin/drills/scenarios/:id          — 删除自定义场景
```

### 演练流程

```
  ┌─────────────┐
  │ 选择场景     │ → vendor_down / timeout / error_response / empty_response / latency_spike
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ 配置参数     │ → 目标供应商、持续时间(1-60min)、场景参数
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ 启动演练     │ → Redis 注入故障模拟 → 状态: running
  └──────┬──────┘
         ▼
  ┌─────────────────┐
  │ 监控验证         │ → 熔断器/自动切换/告警/恢复 各步骤验证
  │ (自动+手动)      │
  └──────┬──────────┘
         ▼
  ┌─────────────┐
  │ 自动恢复     │ → 移除 Redis 故障注入 → 供应商恢复正常
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ 生成报告     │ → 各验证步骤通过/失败 + 耗时 + 截图/日志
  └─────────────┘
```

### 验证检查点

| 检查项 | 验证方式 | 通过标准 |
|--------|---------|---------|
| 熔断器触发 | 检查 Redis 熔断 Key/熔断器状态 | 故障注入后 30s 内熔断器闭合 |
| 自动切换 | 检查路由选择日志 | 请求自动切换到备用供应商 |
| 告警触发 | 检查告警记录 | P0 级别告警在 60s 内生成 |
| 服务降级 | 检查 API 响应头/状态码 | 降级期间返回 X-Degraded 头 |
| 自动恢复 | 移除注入后检查恢复状态 | 熔断器 5min 内恢复到 half-open 或 closed |
| 用户影响 | 检查模拟期间真实用户请求 | 故障仅影响演练流量，真实用户不受影响 |

### 安全约束

| 规则 | 说明 |
|------|------|
| 仅影响演练流量 | 演练服务使用独立 Redis Key 隔离 |
| 演练中用户可见性 | 演练流量标记 X-Drill-Mode 头，可被降级逻辑识别 |
| 自动终止 | 演练超时（默认 60min）未取消则自动恢复 |
| 频率限制 | 同一供应商 24h 内仅允许一次演练 |
| 审计 | 所有演练操作写入审计日志 |

### 验收标准

| # | 用例 | 预期 |
|---|------|------|
| 31.1-1 | 启动故障演练 | 选择场景→配置→启动→显示进行中状态 |
| 31.1-2 | 演练中熔断器触发 | Redis 故障注入后熔断器在 30s 内闭合 |
| 31.1-3 | 自动切换备用供应商 | 演练请求走备用线路 |
| 31.1-4 | 告警触发 | 系统检测到"异常"后生成告警记录 |
| 31.1-5 | 演练完成自动恢复 | 移除注入后系统恢复，熔断器解除 |
| 31.1-6 | 演练报告 | 完整的步骤结果汇总 |

---

## §31.2 多环境配置同步（已实现）

> ⚠️ 已在先前开发中完成：后端 diff/sync API + 前端增强版。

### 数据表结构

```typescript
// environment_configs — 环境配置
export const environmentConfigs = pgTable("environment_configs", {
  id: serial("id").primaryKey(),
  envName: varchar("env_name", { length: 50 }).notNull(),  // 'dev' | 'test' | 'staging' | 'production'
  configKey: varchar("config_key", { length: 200 }).notNull(),
  configValue: text("config_value"),
  configType: varchar("config_type", { length: 30 }).default("string"),
    // 'string' | 'number' | 'boolean' | 'json' | 'yaml'
  version: integer("version").default(1),
  updatedBy: integer("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// environment_sync_logs — 同步日志
export const environmentSyncLogs = pgTable("environment_sync_logs", {
  id: serial("id").primaryKey(),
  sourceEnv: varchar("source_env", { length: 50 }).notNull(),
  targetEnv: varchar("target_env", { length: 50 }).notNull(),
  items: integer("items").default(0),
  conflicts: integer("conflicts").default(0),
  status: varchar("status", { length: 20 }).default("pending"),
    // 'pending' | 'synced' | 'failed' | 'rolled_back'
  executedBy: integer("executed_by").references(() => users.id),
  detail: text("detail"),  // JSON: 同步详情
  createdAt: timestamp("created_at").defaultNow(),
});
```

### API 接口

```
GET    /api/v1/admin/environments                 — 环境列表
GET    /api/v1/admin/environments/:name/config     — 环境配置详情
POST   /api/v1/admin/environments/diff             — 两环境配置对比
  body: { sourceEnv, targetEnv, sections?: string[] }
  response: { added: ConfigItem[], removed: ConfigItem[], modified: ConfigDiff[], same: number }

POST   /api/v1/admin/environments/sync             — 同步配置
  body: { sourceEnv, targetEnv, items: { key, action: 'create'|'update'|'delete' }[], dryRun?: boolean }
  response: { success: boolean, applied: number, failed: number, detail: any }

GET    /api/v1/admin/environments/sync-history     — 同步历史记录
  params: { sourceEnv?, targetEnv?, status?, page, limit }

POST   /api/v1/admin/environments/health-check     — 环境健康检测
  params: { envName? }
  response: { status: 'healthy'|'degraded'|'unhealthy', checks: HealthCheckItem[] }

POST   /api/v1/admin/environments/config/sandbox   — 沙箱预览（模拟执行配置变更）
  body: { configChanges: ConfigChangeItem[] }
  response: { simulated: SimulatedResult, warnings: string[], errors: string[] }
```

### 前端组件

```tsx
<EnvConfigCompare
  sourceEnv: string
  targetEnv: string
  diff: DiffResult
  onSync: (items: SyncItem[]) => Promise<void>
  onEnvChange: (source: string, target: string) => void
/>

<EnvHealthCheck
  envName: string
  checks: HealthCheckItem[]
  onRunCheck: (envName: string) => Promise<void>
  interval?: number  // 自动刷新间隔（秒）
/>

<ConfigSandboxPreview
  proposedChanges: ConfigChangeItem[]
  onSimulate: (changes: ConfigChangeItem[]) => Promise<SimulatedResult>
  onApply: (changes: ConfigChangeItem[]) => Promise<void>
/>

interface DiffResult {
  added: ConfigItem[]     // 仅在源环境存在
  removed: ConfigItem[]   // 仅在目标环境存在
  modified: ConfigDiff[]  // 两环境都存在但值不同
  same: number            // 相同项数量
}

interface ConfigDiff {
  key: string
  sourceValue: any
  targetValue: any
  type: string
}

interface HealthCheckItem {
  name: string
  status: 'pass' | 'fail' | 'warn'
  detail: string
  latencyMs: number
}
```

### 验收标准

| # | 用例 | 预期 |
|---|------|------|
| 31.2-1 | 环境对比 | 显示两环境配置差异（新增/修改/删除） |
| 31.2-2 | 配置同步 | 选择差异项 → 同步到目标环境 |
| 31.2-3 | 健康检测 | 检测各环境服务连通性、配置完整性 |
| 31.2-4 | 沙箱预览 | 变更前模拟执行，展示预期效果 |
| 31.2-5 | 同步历史 | 记录每次同步时间、人、变更量 |
| 31.2-6 | 回滚 | 同步失败时支持一键回滚到同步前版本 |

---

## §31.3 配置沙箱预览

### 功能描述

在变更配置（路由策略、限流参数、熔断阈值等）前，在沙箱环境中对变更后的效果进行模拟执行，验证不会引起生产问题。降低"改完出故障"的风险。

### 沙箱模拟范围

| 配置类型 | 模拟项 | 校验内容 |
|---------|--------|---------|
| 路由策略 | 权重分配变化 | 是否导致某个供应商负载异常升高 |
| 限流参数 | 阈值降低/升高 | 是否影响正常用户调用 |
| 熔断阈值 | 错误率/响应时间阈值 | 新阈值下供应商是否更易熔断 |
| 价格调整 |  模型单价变化 | 对用户端账单的影响范围 |
| 供应商切换 | 主备切换 | 是否成功切换到备用，切换时间 |

### API 接口

```
POST   /api/v1/admin/environments/sandbox/run     — 执行沙箱模拟
  body: { envName, configCategory, proposedChanges }
  response: {
    simulatedResult: any,
    warnings: string[],
    errors: string[],
    impact: { users?: number, calls?: number, cost?: number }
  }

GET    /api/v1/admin/environments/sandbox/history  — 沙箱模拟历史
```

### 验收标准

| # | 用例 | 预期 |
|---|------|------|
| 31.3-1 | 修改路由权重后沙箱模拟 | 显示各供应商负载变化预估 |
| 31.3-2 | 降低限流阈值模拟 | 显示受影响用户数和请求量预估 |
| 31.3-3 | 沙箱模拟报告 | 变更内容 + 模拟结果 + 风险提示 |
| 31.3-4 | 模拟不实际生效 | 模拟不会写入 Redis/DB，只输出结果 |

---

## 边界条件

| # | 场景 | 处理方式 |
|---|------|---------|
| DRILL-001 | 演练中真实供应商也出现故障 | 演练优先终止，真实故障按正常 SOP 处理，演练标记为 cancelled |
| DRILL-002 | 演练注入后 Redis 故障 | 注入失败时立即记录失败原因，演练标记为 failed |
| DRILL-003 | 演练时其他运维正在变更 | 演练开始前检查是否有运行中的变更计划，冲突时提示 |
| DRILL-004 | 多环境同步配置冲突 | 两环境同一 key 都被修改 → 手动选择保留哪个版本 |
| DRILL-005 | 配置同步后目标服务异常 | 支持一键回滚到同步前配置（保留前版本快照） |
| DRILL-006 | 沙箱模拟性能影响 | 沙箱模拟使用独立在内存中执行的评估引擎，不影响生产 |
| DRILL-007 | 演练未自动终止 | 超时后自动任务强制终止并恢复（最多 60 分钟） |

---

## 上下游关系

```
§31 供应商故障演练与多环境管理:
  ├── §31.1 故障演练: drillScenarios/Executions → §5.1 路由熔断器 → Redis 注入
  ├── §31.2 多环境同步: environmentConfigs → ref-4.8-system-config → 版本控制
  ├── §31.3 配置沙箱: sandbox 模拟引擎 → 路由/限流/熔断评估
  └── 管理面板: admin 模块 → 侧边栏"运维配置"入口
```
