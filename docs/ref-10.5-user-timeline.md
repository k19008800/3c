# 深化参考：§10.5 用户时间线

> **对应**：[`PRD-客服支撑模块.md`](PRD-客服支撑模块.md) §10.5
> **关联**：[`ref-10.1-support-workbench.md`](ref-10.1-support-workbench.md)、[`ref-12.1-audit-console.md`](ref-12.1-audit-console.md)
> **优先级**：P0 | **状态**：需求文档（待开发）
> **最后更新**：2026-07-30

---

## 概述

客服排查用户问题时常需要了解"用户最近做了什么"——是否改过密码、是否操作过 API Key、余额何时变动。当前这些信息分散在 operation_logs / balance_logs / ticket_history 等多个表，没有按用户维度的统一时间线展示。

**核心价值**：统一展示用户在平台上的所有关键操作轨迹，客服/运营无需在多个页面跳转查找。

---

## 功能模块

### 1. 时间线展示

以时间为轴，自上而下展示用户所有关键操作：

```
用户时间线 — 张三 (ID: 42)       [07-20 ~ 07-28 ▼] [自定义时间范围]

┌─────────────────────────────────────────────────────┐
│ 🎯  10:23:45  调用 deepseek-chat   +12,345 tokens  │
│ 🎯  10:15:20  调用 qwen-turbo      +5,000 tokens   │
│ 💰  09:30:00  充值 +¥2,000.00     via 支付宝       │
│ 🔑  08:50:12  创建 API Key "my-key"                 │
│ 🔒  08:45:00  登录成功 IP: 10.0.0.1 (上海)          │
│ 📤  昨天     提交工单 "无法调用"   优先级: 高       │
│ 💬  昨天     工单回复 "请检查 API Key 是否到期"    │
│ 🔑  07-27    删除 API Key "old-key"                  │
│ 💳  07-26    绑定支付宝 尾号: 6789                   │
│ 🔒  07-26    登录失败 IP: 192.168.1.1 (异常位置)    │
│   ⚠️ 异地登录预警！                                 │
│ 📄  07-25    提交实名认证                            │
│ ✅  07-25    实名认证通过                            │
│ 💰  07-20    消费 -¥1,200.00  deepseek-chat         │
└─────────────────────────────────────────────────────┘
```

### 2. 时间线过滤

| 筛选维度 | 可选值 |
|---------|--------|
| 时间范围 | 今天 / 昨天 / 近 7 天 / 近 30 天 / 自定义 |
| 操作类型 | 全部 / 登录 / API Key / 调用 / 充值 / 消费 / 工单 / 余额 / 安全 |
| 结果 | 全部 / 成功 / 失败 |
| 状态 | 全部 / 正常 / 异常（异地登录、失败操作等） |

### 3. 时间线事件类型

| 事件类型 | 数据来源 | 图标 | 显示内容 |
|---------|---------|------|---------|
| 登录 | operation_logs | 🔒 | 登录时间/IP/地点/成功/失败 |
| 调用 | call_logs | 🎯 | 模型名/Token数/费用/状态 |
| 充值 | recharges | 💰 | 金额/方式/到账状态 |
| 消费 | call_logs 聚合 | 💳 | 金额/模型名 |
| API Key 操作 | operation_logs | 🔑 | 创建/删除/更新 Key 名 |
| 工单 | tickets | 📤 | 创建/回复/状态变更 |
| 余额变更 | balance_logs | 💰 | 余额变动金额/变动后余额/原因 |
| 实名认证 | operation_logs | 📄 | 提交/通过/驳回 |
| 安全事件 | security_events | ⚠️ | 异地登录、异常 IP |
| 密码变更 | operation_logs | 🔒 | 密码重置/修改 |

### 4. 异常标记

```
🔒  07-26  登录失败 IP: 192.168.1.1 (异常位置)
    ⚠️ 异地登录预警！该用户上次登录 IP 为 10.0.0.1 (上海)
```

自动检测异常模式：

| 异常模式 | 检测规则 |
|---------|---------|
| 异地登录 | 同一用户 1 小时内登录 IP 归属地跨省份 |
| 高频调用 | 同一用户 1 小时内调用次数 > 1000 |
| 异常充值 | 充值金额为特定值 ¥99 / ¥999（洗钱模式） |
| 连续失败 | 登录连续失败 > 3 次 |
| 批量操作 | 1 分钟内删除/创建多个 API Key |
| 非工作时间操作 | 操作时间在 22:00-06:00 |

异常事件在时间线中自动标红/标黄，并附带检测说明。

### 5. 详情查看

点击时间线上的事件可查看详情弹窗：

```
💰 充值 +¥2,000.00 (2026-07-28 09:30:00)

  ┌────────────────────────────────────────────┐
  │  事件 ID:      EVT-20260728-091500          │
  │  时间:         09:30:00                      │
  │  类型:         充值                           │
  │  金额:         ¥2,000.00                     │
  │  方式:         支付宝                         │
  │  状态:         到账成功                       │
  │  到账前余额:   ¥500.00                       │
  │  到账后余额:   ¥2,500.00                     │
  │  订单号:       RCH-20260728-0001             │
  │  操作 IP:      10.0.0.1 (上海)               │
  └────────────────────────────────────────────┘
```

### 6. 导出

| 导出格式 | 说明 |
|---------|------|
| CSV | 时间线列表（时间/类型/事件描述/详情） |
| PDF | 格式化的时间线报告（含异常标记） |

---

## 数据表

用户时间线无新表，数据从以下现有表聚合：

| 表名 | 字段 |
|------|------|
| operation_logs | user_id, action, target_type, target_id, detail, ip, status, created_at |
| call_logs | user_id, model, tokens, cost, status, created_at |
| balance_logs | user_id, amount, balance_after, reason, created_at |
| recharges | user_id, amount, method, status, created_at |
| tickets | user_id, title, status, priority, created_at |
| security_events | user_id, event_type, detail, severity, created_at |

**查询策略**：通过 Redis 缓存聚合结果（TTL 5 分钟），避免多表频繁查询压库。

---

## API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/v1/admin/support/user-timeline/:userId?startDate=&endDate=&types=&status=&page=&limit=` | 用户时间线 | 客服专员以上 |
| `GET` | `/api/v1/admin/support/user-timeline/:userId/event/:eventId` | 事件详情 | 客服专员以上 |
| `GET` | `/api/v1/admin/support/user-timeline/:userId/anomalies?startDate=&endDate=` | 用户异常事件列表 | 客服专员以上 |
| `GET` | `/api/v1/admin/support/user-timeline/:userId/export?format=csv|pdf&filters=` | 导出时间线 | 客服组长以上 |

---

## 前端组件 Props

```tsx
// 时间线列表
interface UserTimelineProps {
  userId: number;
  events: TimelineEvent[];
  filters: TimelineFilters;
  onFilterChange: (filters: Partial<TimelineFilters>) => void;
  onEventClick: (eventId: string) => void;
  onExport: (format: 'csv' | 'pdf') => void;
  pagination: { page: number; total: number; limit: number };
  loading: boolean;
}

// 时间线事件项
interface TimelineEventItemProps {
  event: TimelineEvent;
  isAnomaly: boolean;
  onClick: () => void;
}

// 事件详情弹窗
interface EventDetailModalProps {
  event: TimelineEvent;
  detail: any;
  onClose: () => void;
}

// 时间线过滤面板
interface TimelineFilterPanelProps {
  filters: TimelineFilters;
  onFilterChange: (filters: Partial<TimelineFilters>) => void;
  anomalies: AnomalyEvent[];
}
```

---

## 边界条件

| 场景 | 处理方式 |
|------|---------|
| 时间线数据量 > 10000 条 | 使用滚动分页 + 时间范围限制（最多一次查 90 天）|
| 时间线数据加载慢 | Redis 缓存 5 分钟；长范围查询异步生成并推送到前端 |
| 用户无操作记录 | 显示"该用户暂无操作记录"，不显示空时间线 |
| 跨表查询超时 | 降级返回 3 天内操作日志（operation_logs 为主表），其他表逐步加载 |
| CSV 导出数据量 > 10000 行 | 异步生成 → 站内通知下载，限 1 小时内下载 |
| 异常事件标记过多 | 按严重级别分组展示（高危 / 中危 / 低危） |

---

## 验收标准

1. 按时间轴展示用户登录/调用/充值/消费/工单/API Key/安全事件
2. 支持按时间范围/操作类型/结果多维度筛选
3. 异常事件自动标记 ⚠️ 并附带检测说明
4. 点击事件可查看详情弹窗
5. 时间线数据从 operation_logs / call_logs / balance_logs 等表正确聚合
6. 数据缓存 5 分钟后自动刷新
7. 导出 CSV/PDF 功能正常

---

## 关联模块

| 模块 | 关联方式 |
|------|---------|
| §10.1 客服工作台 | 聚合面板 → "查看完整时间线"跳转到本页 |
| §12.1 审计控制台 | 审计日志数据源相同，用户时间线是审计日志的用户维度裁剪视图 |
| §23.1 操作审计追溯增强 | 共享 operation_logs 表，用户端审计权限与客服端不同 |
| §12.5 日志查看器 | 时间线侧重于用户维度的聚合展示，日志查看器侧重于系统维度 |

---

### [?] 页面帮助
**页面名称**：用户时间线
**核心操作**：查看指定用户在平台上的所有关键操作记录，按时间轴顺序展示
**注意事项**：数据从多个操作记录表聚合而来，存在最长 5 分钟的缓存延迟；异常自动标记仅供参考，需人工确认

### [?] 按钮级帮助对照表
| 按钮/操作 | 帮助说明 |
|----------|---------|
| 筛选 | 按时间范围/操作类型/结果过滤时间线事件 |
| 事件详情 | 点击事件行可查看完整详情信息 |
| 异常标记 | 系统自动检测的异常事件（异地登录、高频调用等）|
| 导出 CSV | 将当前时间线导出为 CSV 格式 |
| 导出 PDF | 将当前时间线导出为 PDF 报告格式（含异常标记）|
