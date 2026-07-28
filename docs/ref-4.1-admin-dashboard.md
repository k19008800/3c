# 管理总览看板 — 深化参考文档

> **对应章节**：[PRD-README.md §4.1 总览看板](../PRD-README.md#41-总览看板-admin)
> **状态**：基于现有后端代码（`api/src/routes/admin/dashboard/`、`api/src/routes/admin/operational-kpi.ts`、`api/src/routes/admin/dashboard/recent-activity.ts`）生成，量化现有看板实现
> **粒度**：看板区域定义 → API 接口 → 前端组件 → 交互说明

---

## 1. 看板布局

```
admin → 总览看板
├── 顶部 KPI 卡片区（12 项运营指标）
│   ├── DAU / 日调用量 / MRR / 毛利率 / 留存率 / ARPU 等
│   └── 每个卡片：当前值 + 对比值 + 变化率 + 状态高亮
│
├── 运营待办队列
│   ├── 待处理安全事件数
│   ├── 代理晋升待审数
│   ├── 公告待推送数
│   └── 各待办 = 数字徽标 + 跳转链接
│
├── 实时活动流（最新 10 条）
│   └── 模型调用实时推送
│
├── 异常指标高亮面板
│   ├── 失败率 > 5% 的模型（红框闪烁）
│   ├── 失败率 3-5% 的模型（黄框）
│   └── 营收环比下降 > 20%（红框）
│
└── 近 7 天趋势折线图
    ├── 调用量 / DAU / Token / 消费 四条线
    └── 悬停显示具体数值
```

## 2. API

### 2.1 GET `/api/v1/admin/dashboard/summary` — 看板概览

整合运营 KPI + 待办 + 异常指标 + 最新活动

**响应**：
```json
{
  "code": 0,
  "data": {
    "kpi": { /* 同 operational/kpi 响应 */ },
    "pending": {
      "securityEvents": 3,
      "agentUpgrades": 2,
      "pendingAnnouncements": 1,
      "operationAlerts": 5
    },
    "anomalies": [
      { "type": "failure_rate", "key": "deepseek-chat", "value": "6.2%", "threshold": "5%", "status": "critical" },
      { "type": "revenue_drop", "key": "本月营收", "value": "-22%", "threshold": "-20%", "status": "critical" }
    ],
    "recentActivity": [
      { "id": "uuid", "model": "deepseek-chat", "status": "success", "cost": 0.12, "time": "3秒前" }
    ]
  }
}
```

### 2.2 待办计数

| 待办项 | 数据源 | 查询方式 |
|-------|-------|---------|
| 未处置安全事件 | `security_events` | WHERE acknowledged=false |
| 代理晋升待审 | `agents` | WHERE audit_status='pending' |
| 公告待推送 | `announcements` | WHERE is_published=false AND scheduledAt IS NULL |
| 异常告警待处理 | `operation_alerts` | WHERE status='pending' |

## 3. 前端组件

**AdminDashboardKpiCardProps**：
```typescript
interface AdminDashboardKpiCardProps {
  title: string;          // "DAU"
  value: number;          // 813
  prev?: number;          // 756
  change?: string;        // "+7.5%"
  status: 'normal' | 'warning' | 'critical';
  unit?: string;
  icon?: string;
  onClick?: () => void;   // 跳转到详情页
}
```

**PendingTaskBadgeProps**：
```typescript
interface PendingTaskBadgeProps {
  tasks: Array<{ label: string; count: number; link: string; severity?: 'warning' | 'critical' }>;
}
```

---

> **文档版本**：v1.0 — 2026-07-28
> **编写依据**：`api/src/routes/admin/dashboard/`、`api/src/routes/admin/operational-kpi.ts`
