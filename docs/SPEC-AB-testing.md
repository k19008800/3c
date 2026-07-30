# 功能说明书：A/B Testing 实验平台

> **对应**：P2 第五批 — A/B Testing（代码已实现）
> **关联**：[`ref-4.5-marketing.md`](ref-4.5-marketing.md)
> **优先级**：P2 | **状态**：需求文档补充（代码已实现，补规格）
> **最后更新**：2026-07-30

---

## 概述

运营活动、定价策略、UI 改版等变更需要验证效果。A/B Testing 平台允许运营创建实验，将用户随机分为实验组和对照组，对比关键指标（转化率、消费额、留存率等）后决定是否全量发布。

**核心价值**：数据驱动决策，避免凭感觉上线导致负面效果。

---

## 功能模块

### 1. 实验创建

```
创建实验

  实验名称 *: [新定价方案测试]
  实验描述: [测试 deepseek 模型降价 10% 对消费量的影响]
  实验类型: [定价实验 ▼]  // 定价实验 | UI 实验 | 活动实验 | 模型实验 | 其他
  实验变量: [________]
   ┌────────────────────────────────────────────────┐
   │ 对照组: 当前价格                                │
   │ 实验组: 降价 10%                               │
   └────────────────────────────────────────────────┘
  目标指标 *:
   ☑ 日消费额
   ☑ 日活跃用户数
   ☑ 转化率（注册→首充）
   ☐ 留存率（次日/7日/30日）
   ☐ API 调用量
  实验分组:
   ├─ 对照组: 50%  (默认配置)
   └─ 实验组: 50%  (实验变量)
  用户范围: [全部用户 ▼]  // 全部用户 | 新用户（注册≤7天）| 指定用户标签
  预计开始时间: [2026-08-01 00:00]
  预计结束时间: [2026-08-07 23:59]
  自动发布策略: [实验组显著优于对照组时自动全量 ▼]
   ⚠️ 置信度要求: 95%

  [保存草稿] [发布实验]
```

### 2. 实验状态

```
实验状态机：

draft（草稿）
  ↓ 发布，用户开始进入分组
running（运行中）
  ↓ 达到最小样本量 + 运行时长
evaluating（评估中）
  ↓ 统计分析完成，结果显著
  ├──→ 实验组显著优于对照组 → auto_publish（自动全量）
  └──→ 无显著差异或实验组劣于对照组 → auto_stop（自动停止）
  ↓ 人工决策
  ├──→ completed（手动结束，选择生效版本）
  └──→ stopped（提前终止）
```

### 3. 实验详情

```
实验详情 — 新定价方案测试

  ┌─────────────────────────────────────────────────────┐
  │  状态: 🟢 运行中（已运行 3 天，剩余 4 天）            │
  │  样本量: 对照组 1,245 人 / 实验组 1,198 人            │
  │  开始时间: 2026-07-28 00:00                           │
  │  结束时间: 2026-08-01 23:59                           │
  └─────────────────────────────────────────────────────┘

  实验结果（实时）

  ┌────────────┬──────────┬──────────┬────────┬──────────┐
  │ 指标       │ 对照组   │ 实验组   │ 变化率  │ 置信度   │
  ├────────────┼──────────┼──────────┼────────┼──────────┤
  │ 日消费额    │ ¥12,000  │ ¥14,500  │ +20.8% │ 97.2%   │ ✅ 显著 │
  │ 日活跃用户  │ 320      │ 345      │ +7.8%  │ 85.1%   │ 不显著 │
  │ 人均消费    │ ¥37.5    │ ¥42.0    │ +12.0% │ 93.5%   │ 趋近显著│
  │ 转化率     │ 2.1%     │ 2.3%     │ +9.5%  │ 72.3%   │ 不显著 │
  └────────────┴──────────┴──────────┴────────┴──────────┘

  [停止实验] [手动发布实验组] [手动发布对照组]
```

### 4. 实验列表

```
实验列表

  [按状态 ▼] [按类型 ▼] [搜索]

  ┌──────┬────────┬──────────┬────────┬────────┬──────────┬────────┐
  │ 名称  │ 类型   │ 状态     │ 开始时间 │ 结束时间 │ 样本量  │ 操作   │
  ├──────┼────────┼──────────┼────────┼────────┼──────────┼────────┤
  │ 新定价 │ 定价实验│ 🟢 运行中 │ 07-28  │ 08-01  │ 2,443   │ [详情]│
  │ 首页改版│ UI 实验│ 🔴 已停止 │ 07-20  │ 07-25  │ 1,200   │ [详情]│
  │ 活动方案│ 活动实验│ ✅ 已完成 │ 07-10  │ 07-17  │ 3,500   │ [详情]│
  └──────┴────────┴──────────┴────────┴────────┴──────────┴────────┘
```

### 5. 数据表

```typescript
// ab_experiments — A/B 实验
export const abExperiments = pgTable("ab_experiments", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  experimentType: varchar("experiment_type", { length: 20 }).notNull(),
  // pricing | ui | campaign | model | other
  config: jsonb("config").notNull(),
  // { controlRatio, variantRatio, metrics, userScope, autoPublishStrategy }
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  // draft | running | evaluating | completed | stopped | auto_published | auto_stopped
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  result: jsonb("result"),
  // { metrics: [{name, controlValue, variantValue, pValue, significant}] }
  publishedVariant: varchar("published_variant"), // control | variant | null
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ab_experiment_assignments — 用户分组
export const abExperimentAssignments = pgTable("ab_experiment_assignments", {
  id: serial("id").primaryKey(),
  experimentId: integer("experiment_id").notNull().references(() => abExperiments.id),
  userId: integer("user_id").notNull().references(() => users.id),
  variant: varchar("variant", { length: 20 }).notNull(), // control | variant
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
});
// 唯一约束：(experimentId, userId)

// ab_experiment_events — 实验事件
export const abExperimentEvents = pgTable("ab_experiment_events", {
  id: serial("id").primaryKey(),
  experimentId: integer("experiment_id").notNull().references(() => abExperiments.id),
  userId: integer("user_id").notNull(),
  eventType: varchar("event_type", { length: 30 }).notNull(),
  // page_view | recharge | api_call | conversion | retention
  eventValue: numeric("event_value", { precision: 14, scale: 4 }), // 如消费金额
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

### 6. API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `POST` | `/api/v1/admin/ab-experiments` | 创建实验 | 运营/管理员 |
| `GET` | `/api/v1/admin/ab-experiments` | 实验列表 | 运营/管理员 |
| `GET` | `/api/v1/admin/ab-experiments/:id` | 实验详情 | 运营/管理员 |
| `PATCH` | `/api/v1/admin/ab-experiments/:id` | 更新实验配置 | 运营/管理员 |
| `POST` | `/api/v1/admin/ab-experiments/:id/publish` | 发布实验 | 运营/管理员 |
| `POST` | `/api/v1/admin/ab-experiments/:id/stop` | 停止实验 | 运营/管理员 |
| `POST` | `/api/v1/admin/ab-experiments/:id/publish-variant` | 手动发布指定版本 | 管理员 |
| `GET` | `/api/v1/admin/ab-experiments/:id/results` | 实时实验结果 | 运营/管理员 |
| `GET` | `/api/v1/admin/ab-experiments/:id/events` | 实验事件日志 | 运营/管理员 |
| `GET` | `/api/v1/admin/ab-experiments/history` | 历史实验及结果 | 运营/管理员 |

### 7. 前端组件 Props

```tsx
interface AbExperimentListProps {
  experiments: AbExperiment[];
  filters: ExperimentFilters;
  onFilterChange: (filters: Partial<ExperimentFilters>) => void;
  onCreate: () => void;
  onView: (id: number) => void;
  loading: boolean;
}

interface AbExperimentDetailProps {
  experiment: AbExperimentDetail;
  results: MetricResult[];
  onStop: () => Promise<void>;
  onPublishVariant: (variant: 'control' | 'variant') => Promise<void>;
  canPublish: boolean;
}

interface AbExperimentCreatorProps {
  onSave: (data: Partial<AbExperiment>) => Promise<void>;
  onPublish: (data: Partial<AbExperiment>) => Promise<void>;
}
```

### 8. 边界条件

| 场景 | 处理方式 |
|------|---------|
| 最小样本量不足 | 实验结果面板显示"样本量不足，结果不可靠（需 ≥ 200 人/组）" |
| 实验时间不足 | 运行 < 24 小时的结果标记为"仅供参考" |
| 用户同时参与多个实验 | 嵌套实验需确保分组不冲突（同一个用户不能同时参与两个同类型实验）|
| 实验组效果显著但样本量小 | 置信度 < 95% 时标记为"趋近显著，建议延长实验时间" |
| 实验变量配置错误 | 发布时校验实验变量配置是否完整 |
| 自动发布失败 | 系统自动发布失败时告警通知管理员手动处理 |

### 9. 关联模块

| 模块 | 关联方式 |
|------|---------|
| §4.5 营销活动 | 活动类型实验，对比不同活动方案的效果 |
| §5.1 智能路由 | 定价类型实验，对比不同定价策略的消费影响 |
| 运营决策 | 实验结果为全量发布提供数据支撑 |

---

### [?] 页面帮助
**页面名称**：A/B Testing 实验平台
**核心操作**：创建实验、发布运行、查看实时结果、手动发布实验组/对照组
**注意事项**：实验需达到最小样本量（200 人/组）和最少运行时间（24h）后结果才可靠；置信度 > 95% 才算显著

### [?] 按钮级帮助对照表
| 按钮/操作 | 帮助说明 |
|----------|---------|
| 创建实验 | 定义实验变量、目标指标、分组比例和用户范围 |
| 发布实验 | 实验开始运行，用户进入分组 |
| 停止实验 | 提前终止实验，已分配用户保持当前分组 |
| 发布实验组 | 手动将实验组配置全量发布给所有用户 |
| 发布对照组 | 手动将对照组配置全量发布给所有用户 |
| 查看结果 | 查看实验各指标的实时对比数据 |