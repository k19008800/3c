# 深化参考：§12.1 操作审计控制台

> **对应**：[`PRD-系统管理员支撑.md`](PRD-系统管理员支撑.md) §12.1
> **关联**：[`SPEC-§23-系统级能力增强.md`](SPEC-§23-系统级能力增强.md) §23.1
> **优先级**：P0 | **状态**：需求文档（待开发）
> **最后更新**：2026-07-30

---

## 概述

系统有完整的 `audit_logs` / `operation_logs` 表记录所有操作日志，但缺少一个专门的操作审计控制台用于快速定位问题。管理员排查"谁在什么时候做了什么"全靠翻数据库，效率低。

**核心价值**：提供多维筛选审计日志查看面板、变更 diff 可视化、异常操作模式识别、一键回滚能力。

---

## 功能模块

### 1. 审计日志查询

```
审计日志

  时间范围: [2026-07-20 ~ 2026-07-28 ▼ 自定义]  操作者: [所有用户 ▼]
  操作类型: [全部 ▼]  资源类型: [全部 ▼]  目标: [搜索...]

  ┌──────┬────────┬────────┬────────┬────────┬────────────┬────────┐
  │ 时间  │ 操作者  │ 操作    │ 资源    │ 目标    │ 状态      │ 操作   │
  ├──────┼────────┼────────┼────────┼────────┼────────────┼────────┤
  │ 10:23 │ admin  │ 修改角色 │ 用户    │ zhang  │ ✅ 成功   │ [详情]│
  │ 09:15 │ admin  │ 调整余额 │ 用户    │ li     │ ✅ 成功   │ [详情]│
  │ 03:15 │ system │ 自动告警 │ 供应商  │ GLM    │ ⚠️ 告警   │ [详情]│
  │ 昨天  │ admin  │ 修改配置 │ 系统    │ 限流   │ ✅ 成功   │ [详情]│
  └──────┴────────┴────────┴────────┴────────┴────────────┴────────┘

  ℹ️ 共 1,234 条记录  第 1/50 页
```

| 筛选维度 | 说明 |
|---------|------|
| 时间范围 | 预设（今天/昨天/近7天/近30天）+ 自定义 |
| 操作者 | 所有用户 / 指定用户 |
| 操作类型 | 全部 / create / update / delete / adjust_balance / role_change / config_change / login |
| 资源类型 | 全部 / user / api_key / vendor / model / config / recharge / withdraw / agent / system |
| 目标 | 按目标名称/ID 模糊搜索 |
| 状态 | 全部 / 成功 / 失败 |

### 2. 操作详情弹窗

```
操作详情

  ┌────────────────────────────────────────────┐
  │  操作 ID:       AUD-20260728-001234         │
  │  操作时间:      2026-07-28 10:23:45         │
  │  操作者:        admin@3cloud.com            │
  │  操作者 IP:     10.0.0.1                    │
  │  操作者 UA:     Mozilla/5.0 ...             │
  │  操作类型:      update_user_role             │
  │  资源类型:      user                         │
  │  目标 ID:       42                          │
  │  目标名称:      zhangsan                     │
  │                                              │
  │  变更详情:                                   │
  │  ┌──────────────────────────────────────┐   │
  │  │ 变更前           │ 变更后             │   │
  │  ├──────────────────────────────────────┤   │
  │  │ role: "user"     │ role: "admin"     │   │
  │  │                  │ updatedBy: admin  │   │
  │  └──────────────────────────────────────┘   │
  │                                              │
  │  请求 ID:       req-abc123                    │
  │  关联记录:      [查看操作日志]                │
  └────────────────────────────────────────────┘
```

变更 diff 可视化策略：
- 单一字段变更 → 直接 before/after 对比
- 多字段变更 → 表格高亮差异字段
- JSON 配置变更 → 格式化 JSON diff（使用颜色标注新增/删除/修改）

### 3. 异常操作模式识别

系统自动分析审计日志，标记异常模式：

| 异常模式 | 检测规则 | 示例 |
|---------|---------|------|
| 非工作时间操作 | 时间在 22:00-06:00 之间的敏感操作 | 凌晨批量改配置 |
| 敏感操作 | modify_role / adjust_balance / config_change / delete_resource | 改管理员权限 |
| 高频操作 | 同一 IP 在 5 分钟内操作次数 > 20 | 批量删除用户 |
| 首次操作 | 操作者首次执行某种操作类型 | 首次调整余额 |
| 操作失败 | 同一操作类型连续失败 > 3 次 | 多次尝试删除失败 |

异常模式在列表中自动标注 ⚠️ 图标，管理员可点击查看详情。

### 4. 操作回滚

对配置变更类的操作（config_change / user_role / api_key），提供一键回滚能力：

```
[回滚] → 弹窗确认

  ┌────────────────────────────────────────────┐
  │  即将回滚以下操作：                          │
  │                                              │
  │  操作类型: 修改系统配置                       │
  │  操作时间: 2026-07-28 10:23                  │
  │  操作者: admin@3cloud.com                    │
  │                                              │
  │  回滚效果: 恢复为操作前状态                    │
  │  rate_limit.rpm: 1000 → 500                 │
  │                                              │
  │  ⚠️ 此操作不可逆，请确认                     │
  │                                              │
  │  [确认回滚] [取消]                            │
  └────────────────────────────────────────────┘
```

回滚实现：
- 从审计日志中提取 `before` 字段
- 构造反向操作写入数据库
- 记录回滚操作到审计日志（类型：rollback）
- 非配置类操作不支持回滚（如 adjust_balance）

### 5. 导出

| 导出格式 | 说明 |
|---------|------|
| CSV | 列表字段（时间/操作者/操作/资源/目标/状态） |
| JSON | 完整数据（含变更 diff 详情） |

---

## API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/v1/admin/audit-logs?operatorId=&targetType=&action=&resourceType=&targetKeyword=&startDate=&endDate=&status=&page=&limit=` | 审计日志列表 | audit_view |
| `GET` | `/api/v1/admin/audit-logs/:id` | 审计日志详情（含 before/after diff） | audit_view |
| `GET` | `/api/v1/admin/audit-logs/anomalies?startDate=&endDate=` | 异常操作模式检测结果 | audit_admin |
| `POST` | `/api/v1/admin/audit-logs/:id/rollback` | 回滚操作（仅配置变更类） | super_admin |
| `GET` | `/api/v1/admin/audit-logs/export?format=csv|json&filters=` | 导出审计日志 | audit_admin |
| `GET` | `/api/v1/admin/audit-logs/summary?startDate=&endDate=` | 审计统计（操作量趋势/操作类型分布） | audit_view |

---

## 前端组件 Props

```tsx
interface AuditLogListProps {
  logs: AuditLog[];
  filters: AuditFilters;
  onFilterChange: (filters: Partial<AuditFilters>) => void;
  onViewDetail: (id: number) => void;
  onExport: (format: 'csv' | 'json') => void;
  pagination: { page: number; total: number; limit: number };
  loading: boolean;
}

interface AuditDetailModalProps {
  log: AuditLog;
  diff: { field: string; before: any; after: any }[];
  onRollback?: (id: number) => Promise<void>;
  onClose: () => void;
  canRollback: boolean;
}

interface AnomalyPanelProps {
  anomalies: Anomaly[];
  onFilterByAnomaly: (type: string) => void;
  onViewLog: (id: number) => void;
}
```

---

## 边界条件

| 场景 | 处理方式 |
|------|---------|
| 审计日志数据量过大 | 超过 3 个月的数据自动归档到日志分区表，查询时按时间范围路由 |
| 回滚目标已被后续操作覆盖 | 检测当前值与回滚目标值的差异，提示"当前值已变更，回滚可能不一致" |
| 异常操作误报 | 管理员可将某条标记为"误报"（False Positive），降低同模式权重 |
| 导出数据量 > 10 万行 | 异步生成 → 站内通知下载，限 24 小时内下载 |
| 审计日志保留期限 | 保留至少 1 年，超过 1 年的数据可压缩归档（按季度分区） |

---

## 验收标准

1. 审计日志支持时间/操作者/操作类型/资源类型多维度筛选 + 关键词搜索
2. 点击日志行 → 弹窗显示完整的操作详情（含 before/after diff）
3. 异常操作模式自动标注 ⚠️（非工作时间/敏感操作/高频操作/首次操作）
4. 配置变更类操作可一键回滚，回滚后生成回滚记录
5. 审计日志可导出为 CSV 或 JSON
6. 审计统计页面展示操作量趋势图和操作类型分布

---

## 关联模块

| 模块 | 关联方式 |
|------|---------|
| §23.1 操作审计追溯增强 | 用户端审计视角（复用 audit_logs 数据源） |
| §12.2 数据库面板 | 审计日志数据自动归档到分区表 |
| §12.8 版本管理 | 配置回滚与版本管理联动 |

---

### [?] 页面帮助
**页面名称**：操作审计控制台
**核心操作**：查看审计日志、筛选检索、查看变更详情、异常操作识别、回滚配置变更
**注意事项**：审计日志不可删除或修改；回滚操作不可逆，请确认后再执行

### [?] 按钮级帮助对照表
| 按钮/操作 | 帮助说明 |
|----------|---------|
| 筛选 | 按时间/操作者/操作类型/资源类型多维度过滤 |
| 详情 | 查看操作的完整信息包括 before/after 变更对比 |
| 回滚 | 将配置变更类操作回滚到变更前状态（仅 super_admin）|
| 导出 | 按当前筛选条件导出为 CSV 或 JSON 格式 |
| 标记误报 | 将异常模式标记为误报，降低同类模式权重 |
