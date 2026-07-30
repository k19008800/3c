# 运营总纲 — 深化参考文档

> **对应章节**：[PRD-README.md §1.3 核心商业指标（运营 KPI）](../PRD-README.md#13-核心商业指标运营-kpi) + [§1.4 用户分层与运营策略](../PRD-README.md#14-用户分层与运营策略)
> **状态**：基于现有后端代码（`api/src/routes/admin/operational-kpi.ts`、`api/src/services/stats-usage-service/`）生成，对 PRD 已有内容做复习性量化补充和 API 级规格化
> **粒度**：KPI 完整定义 → API 接口 → 数据计算方式 → 前端组件 → 交叉引用

---

## 目录

1. [KPI 指标体系](#1-kpi-指标体系)
2. [用户分层策略](#2-用户分层策略)
3. [运营看板数据流](#3-运营看板数据流)
4. [近 7 天趋势](#4-近-7-天趋势)

---

## 1. KPI 指标体系

### 1.1 12 项运营指标总览

| # | 指标 | 数据源 | 缓存 | 更新频率 | API Key |
|----|------|-------|------|---------|---------|
| 1 | DAU | `call_logs.userId` DISTINCT | 5min | 实时 | `dau` |
| 2 | 日调用量 | `call_logs` COUNT | 5min | 实时 | `daily_calls` |
| 3 | MRR | consumption_logs 聚合 | 1h | 每日 | `mrr` |
| 4 | 毛利率 | 财务模块自动计算 | 1h | 每日 | `gross_margin` |
| 5 | 7 日留存 | 用户分析模块 | 1h | 每日 | `retention_7d` |
| 6 | 30 日留存 | 用户分析模块 | 1h | 每日 | `retention_30d` |
| 7 | 代理活跃度 | 代理模块 | 1h | 每日 | `agent_activity` |
| 8 | Key 使用率 | `api_keys` + `call_logs` | 5min | 实时 | `key_usage_rate` |
| 9 | 供应商健康度 | 健康检查模块 | 1min | 实时 | `vendor_health` |
| 10 | 告警收敛率 | 告警模块 | 1h | 每日 | `alert_convergence` |
| 11 | 自助结算率 | 结算模块 | 1h | 每日 | `self_settlement_rate` |
| 12 | ARPU | 财务模块 | 24h(历史固定值) | 每月 | `arpu` |

### 1.2 API

#### GET `/api/v1/admin/operational/kpi` — 运营 KPI 数据

**权限**: `DASHBOARD_VIEW`

**缓存**: 300 秒（Redis `admin:operational:kpi`）

**响应**：
```json
{
  "code": 0,
  "data": {
    "dau": { "value": 813, "prev": 756, "change": "+7.5%", "status": "normal" },
    "daily_calls": { "value": 152345, "prev": 148200, "change": "+2.8%", "status": "normal" },
    "mrr": { "value": 456000, "unit": "元", "status": "normal" },
    "gross_margin": { "value": 32.5, "unit": "%", "status": "normal" },
    "retention_7d": { "value": 45.2, "unit": "%", "status": "warning" },
    "retention_30d": { "value": 22.8, "unit": "%", "status": "normal" },
    "agent_activity": { "value": 68.5, "unit": "%", "status": "normal" },
    "key_usage_rate": { "value": 52.3, "unit": "%", "status": "warning" },
    "vendor_health": { "value": 99.2, "unit": "%", "status": "normal" },
    "alert_convergence": { "value": 78.5, "unit": "%", "status": "normal" },
    "self_settlement_rate": { "value": 82.1, "unit": "%", "status": "normal" },
    "arpu": { "value": 458, "unit": "元", "status": "normal" }
  }
}
```

**status 取值**：`normal` / `warning` / `critical`（对应前端黄框/红框高亮）

### 1.3 DAU 计算逻辑

```sql
-- 今日 DAU
SELECT DISTINCT user_id FROM call_logs
WHERE created_at >= today_start AND created_at < now;

-- 昨日 DAU（用于对比）
SELECT DISTINCT user_id FROM call_logs
WHERE created_at >= yesterday_start AND created_at < today_start;
```

### 1.4 关键指标计算方式

| 指标 | 计算方式 | 时间窗口 |
|------|---------|---------|
| DAU | call_logs 中 DISTINCT user_id | 今日 00:00 至今 |
| MRR | SUM(call_logs.cost) WHERE status='success' | 近 30 天 |
| 毛利率 | (SUM(收入) - SUM(成本)) / SUM(收入) × 100% | 近 30 天 |
| 7 日留存 | (注册后第 7 天有调用的用户) / (7 天前注册的用户) × 100% | 滚动计算 |
| Key 使用率 | (近 7 天有调用的 Key) / (总 Key 数) × 100% | 近 7 天 |
| ARPU | 月总消费 / 月活跃用户 | 上月 |

---

## 2. 用户分层策略

### 2.1 API

#### GET `/api/v1/admin/operational/user-tiers` — 用户分层数据

**缓存**: 600 秒（Redis `admin:operational:user-tiers`）

**响应**：
```json
{
  "code": 0,
  "data": {
    "seed": { "name": "种子用户", "count": 45, "percentage": "5%", "totalConsumption": 450000 },
    "active": { "name": "活跃用户", "count": 180, "percentage": "22%", "totalConsumption": 89000 },
    "normal": { "name": "普通用户", "count": 350, "percentage": "43%", "totalConsumption": 12000 },
    "dormant": { "name": "休眠用户", "count": 150, "percentage": "18%", "totalConsumption": 0 },
    "churned": { "name": "流失用户", "count": 90, "percentage": "11%", "totalConsumption": 0 }
  }
}
```

### 2.2 分层定义

| 分层 | 定义 | 阈值 | 运营策略 |
|------|------|------|---------|
| 种子用户 | 月消费 > ¥1000 | 上月消费汇总 > 100000（分）| 专属经理、优先支持、专属折扣 |
| 活跃用户 | 月消费 ¥100-1000 | 上月消费 10000-100000（分）| 用量报告推送、活动通知 |
| 普通用户 | 月消费 ¥10-100 | 上月消费 1000-9999（分）| 邮件营销、满赠活动 |
| 休眠用户 | 有登录但月消费 < ¥10 | 上月有 login 操作但消费 < 1000（分）| 模型更新推送、优惠码唤醒 |
| 流失用户 | 注册 > 30 天且近 30 天无登录 | 无 login 操作近 30 天 | 召回邮件、新功能通知 |

---

## 3. 运营看板数据流

### 3.1 数据流

```
管理端加载运营看板
  → 并行请求：
    → GET /api/v1/admin/operational/kpi（12 项指标）
    → GET /api/v1/admin/operational/user-tiers（用户分层）
    → GET /api/v1/admin/operational/trends（近 7 天趋势）
  → Redis 缓存有 → 直接返回
  → Redis 缓存无 → 实时查询数据库 → 写入缓存（300s/600s TTL）
  → 前端渲染 12 KPI 卡片 + 用户分层饼图 + 趋势折线图
```

### 3.2 前端组件

**OperationalKpiPanelProps**：
```typescript
interface OperationalKpiPanelProps {
  kpiData: Record<string, KpiItem>;
  onRefresh?: () => Promise<void>;
}

interface KpiItem {
  value: number;
  prev?: number;
  change?: string;       // "+7.5%"
  status: 'normal' | 'warning' | 'critical';
  unit?: string;         // "元" / "%"
}
```

**UserTierPieChartProps**：
```typescript
interface UserTierPieChartProps {
  tiers: Array<{ name: string; count: number; percentage: string; color: string }>;
  onTierClick?: (tierName: string) => void;
}
```

### 3.3 关联模块

| 模块 | 路径 | 说明 |
|------|------|------|
| `operational-kpi.ts` | `routes/admin/operational-kpi.ts` | KPI + 用户分层 + 趋势 API |
| `stats-usage-service/` | `services/stats-usage-service/` | 用量聚合统计 |
| `admin dashboard` | 前端 | KPI 卡片/趋势图/用户分层 |

---

## 4. 近 7 天趋势

### 4.1 API

#### GET `/api/v1/admin/operational/trends` — 近 7 天趋势

**缓存**: 600 秒

**响应**：
```json
{
  "code": 0,
  "data": {
    "series": [
      { "date": "2026-07-21", "calls": 21345, "dau": 756, "tokens": 8520000, "cost": 65200 },
      { "date": "2026-07-22", "calls": 22450, "dau": 780, "tokens": 9100000, "cost": 68900 }
    ],
    "updatedAt": "2026-07-28T10:00:00.000Z"
  }
}
```

### 4.2 前端趋势图

```
运营看板 → 近 7 天趋势
├── 调用量趋势（蓝色折线）
├── DAU 趋势（绿色折线）
├── Token 消耗趋势（紫色折线，次坐标轴）
└── 消费金额趋势（橙色折线，次坐标轴）

交互：悬停显示具体数值 / 切换指标
```

---

> **文档版本**：v1.0 — 2026-07-28
> **编写依据**：`api/src/routes/admin/operational-kpi.ts`、`api/src/services/stats-usage-service/`
> **说明**：本文档为复习性补充，PRD §1.3/§1.4 已有完整总纲，本文档主要提供 API 级别规格和前后端数据接口定义

---

## 边界条件

### 数据加载场景

| # | 场景 | 触发条件 | 预期行为 |
|---|------|---------|---------|
| OPS-001 | Redis 缓存穿透 | 缓存中不存在 KPI/用户分层/趋势数据，且数据库查询超时 | 返回空数据骨架，前端展示 Skeleton 加载态，不阻塞其他模块 |
| OPS-002 | 某 KPI 指标计算异常 | 依赖数据表（如 `call_logs`）出现临时不可用或数据损坏 | 该指标返回 `status: "warning"` 并展示 `--` 占位，其余 11 项指标正常渲染 |
| OPS-003 | 时间范围穿越 | 前端选择的时间范围跨越了系统首次记录数据的日期 | API 自动截断到最早可用数据日期，前端展示已截断范围提示 |
| OPS-004 | 用户分层全空 | 系统中暂无任何用户调用记录，用户分层各层 count 均为 0 | 饼图展示「暂无数据」占位，底部提示「数据将在首个用户产生调用后刷新」|
| OPS-005 | 趋势数据部分日期缺失 | 近 7 天中某天网络故障导致 `call_logs` 记录不全 | 趋势图该日期数据点标记为「数据缺失」（虚线连接），不影响其他日期 |

### 异常流程

| 场景 | 恢复策略 |
|------|---------|
| Redis 缓存连接中断 | 降级为直接查询数据库，恢复后重新写入缓存 |
| 用户分层计算超时（> 5s） | 返回上一次缓存的分层快照，同时后台异步刷新 |
| 连续 3 次刷新失败 | 前端展示「数据暂时不可用」提示，停止自动轮询，提供手动刷新按钮 |
