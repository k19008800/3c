# 运营大屏（Dashboard Pro）— 深化参考文档

> **对应章节**：[PRD-README.md §4.1 总览看板](../PRD-README.md#41-总览看板) — 深化模块
> **状态**：新功能。在已有管理看板基础上新增运营大屏模式。
> **定位**：面向决策层、外部展示的全屏实时数据大屏，支持投屏/自动轮播/可配置指标。
> **粒度**：UI布局 → 数据流 → API → 配置 → 交叉引用

---

## 目录

1. [定位与场景](#1-定位与场景)
2. [大屏布局](#2-大屏布局)
3. [数据指标卡片](#3-数据指标卡片)
4. [实时数据流](#4-实时数据流)
5. [自动轮播与切换](#5-自动轮播与切换)
6. [大屏配置](#6-大屏配置)
7. [API 接口规格](#7-api-接口规格)
8. [前端组件 Props](#8-前端组件-props)

---

## 1. 定位与场景

| 场景 | 用户 | 需求 |
|------|------|------|
| 公司作战室大屏 | CEO/运营总监 | 全屏投屏展示核心业务指标 |
| 运营监控中心 | 运营团队 | 多屏轮播不同看板（营收/用户/告警） |
| 对外展示 | 投资方/合作方 | 对外展示平台实力和运营数据 |
| 日常运营 | 运营人员 | 在管理后台查看实时运营概览 |

**与现有管理看板的区别**：

| 维度 | 管理看板 | 运营大屏 |
|------|---------|---------|
| 展示形态 | 内嵌后台页面 | 全屏独占模式 |
| 刷新方式 | 手动/定时刷新 | 实时推送/3秒轮询 |
| 数据粒度 | 可交互/下钻 | 纯展示，关键指标突出 |
| 交互 | 丰富（点击/筛选/操作） | 无交互（纯展示） |
| 配色 | 浅色主题 | 深色主题（大屏专用） |
| 入口 | `/admin` 仪表盘 | `/admin/dashboard-pro`（独立页面） |

---

## 2. 大屏布局

### 2.1 默认布局模板

```
┌──────────────────────────────────────────────────────────────┐
│   3CLOUD 运营数据大屏         2026-07-28 10:35:42            │
│                               实时监控 · 自动更新             │
├──────────┬──────────┬──────────┬──────────┬──────────┬──────┤
│ 今日DAU  │ 日调用量  │   MRR    │ 毛利率   │ 客单价    │ 留存率│
│  1,234   │ 156,789  │ ¥456,000│  32.5%  │  ¥458    │ 45.2% │
│  ↑12.5%  │  ↑ 8.2%  │  ↑ 3.1% │  ↓ 1.2% │  ↑ 5.8%  │ ↓ 2.1%│
├──────────┴──────────┴──────────┴──────────┴──────────┴──────┤
│               │                        │                     │
│   调用量趋势  │     收入趋势(按天)      │  模型调用热力图     │
│   (24小时)   │                        │  (最近24h)         │
│   折线图     │     柱状图              │  热力图            │
│               │                        │                     │
├──────────────├────────────────────────┼─────────────────────┤
│ 供应商健康度 │    实时告警事件流       │  TOP 10 活跃用户   │
│ 状态面板     │    (WebSocket推送)     │  滚动列表           │
├──────────────┴────────────────────────┴─────────────────────┤
│  代理商 TOP 10 排行榜 │  用户注册趋势(7天) │  模型消费占比    │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 布局容器结构

```typescript
interface DashboardProLayout {
  grid: {
    rows: 2 | 3;            // 主行数
    columns: 4 | 6;          // 列数
  };
  panels: PanelConfig[];     // 面板配置
}

interface PanelConfig {
  id: string;
  type: "kpi_card" | "line_chart" | "bar_chart" | "heatmap" | "status_panel" | "event_stream" | "leaderboard" | "pie_chart";
  title: string;
  position: { row: number; col: number; rowSpan: number; colSpan: number };
  dataSource: string;       // 数据源标识
  config?: Record<string, any>; // 面板级别配置
  showBorder?: boolean;
  showTitle?: boolean;
}
```

### 2.3 响应式适配

| 分辨率 | 布局调整 |
|--------|---------|
| 1920×1080 (标准大屏) | 默认 6 列 2 行布局 |
| 2560×1440 (2K大屏) | 动态增加面板，8 列 3 行 |
| 3840×2160 (4K大屏) | 全量面板，10 列 3 行，更大字号 |
| 1366×768 (笔记本) | 降级为 4 列单行滚动布局 |

---

## 3. 数据指标卡片

### 3.1 KPI 卡片规格

**单个卡片布局**：

```
┌───────────────────────┐
│ 今日 DAU              │  ← 标题(badge色)
│                       │
│ 1,234                 │  ← 主值(特大字号)
│ ↑ 12.5% 较昨日        │  ← 变化率(绿涨红跌)
│                       │
│ ━━━━━━━━━━━━━━ 目标80%│  ← 进度条(选配)
└───────────────────────┘
```

**卡片动画**：
- 数值变化时：数字滚动动画（tweening，持续 1.5s）
- 状态变更时：边框颜色渐变过渡（warning=黄, critical=红）
- 数据刷新时：短暂脉冲高亮（200ms 背景变亮再恢复）

### 3.2 预设 KPI 卡片列表

| 卡片ID | 标题 | 数据源 | 刷新频率 | 进度条 |
|--------|------|-------|---------|--------|
| `dau` | 今日 DAU | KPI API | 10s | 对比目标DAU |
| `daily_calls` | 日调用量 | KPI API | 10s | — |
| `mrr` | 月流水 MRR | KPI API | 60s | 对比月度目标 |
| `gross_margin` | 毛利率 | KPI API | 60s | 基准线 30% |
| `retention_7d` | 7日留存率 | KPI API | 3600s | 基准线 20% |
| `arpu` | 客单价 ARPU | KPI API | 3600s | — |
| `vendor_health` | 供应商健康度 | KPI API | 10s | 基准线 99% |
| `agent_activity` | 代理活跃度 | KPI API | 3600s | — |
| `today_revenue` | 今日营收 | billing聚合 | 30s | 对比昨日 |
| `today_new_users` | 今日新增用户 | users聚合 | 30s | 对比昨日 |
| `active_keys` | 活跃Key数 | api_keys聚合 | 30s | — |
| `avg_latency` | 平均延迟 | call_logs聚合 | 10s | < 3000ms 绿色 |

---

## 4. 实时数据流

### 4.1 WebSocket 推送机制

**连接**：大屏页面加载时建立 WebSocket 连接到 `/ws/dashboard-pro`

**消息格式**：

```json
{
  "type": "kpi_update",
  "data": {
    "dau": { "value": 1234, "prev": 1101, "change": "+12.5%", "status": "normal" },
    "daily_calls": { "value": 156789, "prev": 144900, "change": "+8.2%", "status": "normal" }
  },
  "timestamp": "2026-07-28T10:35:42Z"
}
```

```json
{
  "type": "alert_event",
  "data": {
    "level": "warning",
    "title": "调用失败率突增",
    "message": "近5分钟失败率 7.2%，超过阈值 5%",
    "affectedModel": "deepseek-chat",
    "affectedUsers": 23,
    "timestamp": "2026-07-28T10:35:42Z"
  }
}
```

```json
{
  "type": "call_event",
  "data": {
    "model": "deepseek-chat",
    "status": "success",
    "tokens": 1234,
    "cost": 0.0123,
    "latency": 567,
    "userId": 1001,
    "timestamp": "2026-07-28T10:35:42Z"
  }
}
```

**降级策略**：WebSocket 断线 → 自动切换到 3 秒 HTTP 轮询 → 重连成功后切回 WS

### 4.2 HTTP 轮询 API

| 方法 | 路径 | 说明 | 缓存 |
|------|------|------|------|
| GET | `/api/v1/admin/dashboard-pro/kpi` | 全部 KPI 指标 | Redis 10s |
| GET | `/api/v1/admin/dashboard-pro/charts` | 全部图表数据 | Redis 30s |
| GET | `/api/v1/admin/dashboard-pro/realtime` | 实时轻量数据 | 无缓存 |

**realtime 接口响应**（最小化数据，适合 3s 轮询）：

```json
{
  "dau": 1234,
  "dailyCalls": 156789,
  "todayRevenue": 12500.50,
  "activeUsersLast5Min": 87,
  "failRate": 2.3,
  "avgLatencyMs": 1847,
  "vendorStatus": {
    "deepseek": "online",
    "openai": "online",
    "anthropic": "degraded"
  }
}
```

---

## 5. 自动轮播与切换

### 5.1 多屏轮播配置

大屏支持配置多组面板布局（screen），按时间间隔自动轮播切换：

```typescript
interface DashboardProConfig {
  screens: ScreenConfig[];
  switchInterval: number;  // 切换间隔（秒），默认 30
  autoPlay: boolean;       // 是否自动轮播
}

interface ScreenConfig {
  id: string;
  name: string;            // 如"营收总览"、"用户增长"、"技术监控"
  layout: PanelConfig[];   // 该屏的面板配置
  duration: number;        // 该屏展示时长（秒），0=继承全局
}
```

### 5.2 预设屏幕模板

| 屏ID | 名称 | 内容 |
|------|------|------|
| `revenue` | 营收总览 | MRR/毛利率/日营收/Top消费模型/收入趋势/代理商排行 |
| `user_growth` | 用户增长 | DAU/新增/留存/活跃趋势/注册来源/用户分层 |
| `tech_monitor` | 技术监控 | 供应商健康/平均延迟/失败率/告警流/调用量热力图 |
| `agent_performance` | 代理业绩 | 代理活跃度/Top代理/佣金发放/提现统计 |

### 5.3 屏切换动画

- 过渡动画：淡入淡出（duration 500ms）
- 切换前 3 秒：右上角显示下一屏名称倒计时小标签
- 手动锁定：点击"暂停轮播"按钮停止自动切换

---

## 6. 大屏配置

### 6.1 配置存储

```typescript
// site_configs 中存储大屏配置
{
  "dashboard_pro": {
    "enabled": true,
    "autoPlay": true,
    "switchInterval": 30,
    "refreshInterval": 3,       // 数据刷新间隔(秒)
    "theme": "dark",            // dark | light
    "locale": "zh-CN",
    "screens": [...]            // 屏配置数组
  }
}
```

### 6.2 配置管理页面

**路径**：`/admin/config/dashboard-pro`

**可配置项**：

| 配置项 | 说明 |
|--------|------|
| 启用大屏 | 开关，关闭后入口隐藏 |
| 自动轮播 | 开关 |
| 切换间隔 | 15s / 30s / 60s / 自定义 |
| 数据刷新频率 | 3s / 5s / 10s / 30s |
| 配色方案 | 深色/浅色 |
| 屏管理 | 增删改屏、每个屏的面板自由拖拽排序 |

### 6.3 面板拖拽配置

管理端配置页面支持：
- 从面板库拖拽到布局网格
- 拖拽调整面板位置和大小（rowSpan/colSpan）
- 双击面板进入配置详情（数据源/标题/阈值/显示选项）
- 右键删除面板
- 保存为屏模板（供其他屏复用）

---

## 7. API 接口规格

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/dashboard-pro/config` | 获取大屏配置 | DASHBOARD_VIEW |
| PUT | `/api/v1/admin/dashboard-pro/config` | 更新大屏配置 | USER_EDIT |
| GET | `/api/v1/admin/dashboard-pro/kpi` | 获取全部KPI指标 | DASHBOARD_VIEW |
| GET | `/api/v1/admin/dashboard-pro/charts` | 获取全部图表数据 | DASHBOARD_VIEW |
| GET | `/api/v1/admin/dashboard-pro/realtime` | 轻量实时快照 | DASHBOARD_VIEW |
| GET | `/api/v1/admin/dashboard-pro/screens` | 屏模板列表 | DASHBOARD_VIEW |
| POST | `/api/v1/admin/dashboard-pro/screens` | 创建屏模板 | USER_EDIT |
| PUT | `/api/v1/admin/dashboard-pro/screens/:id` | 更新屏模板 | USER_EDIT |
| DELETE | `/api/v1/admin/dashboard-pro/screens/:id` | 删除屏模板 | USER_EDIT |

**WebSocket**：`/ws/dashboard-pro` — 实时数据推送

---

## 8. 前端组件 Props

### 8.1 DashboardPro — 大屏主容器

```typescript
interface DashboardProProps {
  mode?: "view" | "config";   // 展示模式 / 配置模式
  config?: DashboardProConfig;
}

interface DashboardProState {
  currentScreenIndex: number;
  isPlaying: boolean;
  isFullscreen: boolean;
  kpiData: Record<string, KpiCardData>;
  chartsData: Record<string, ChartData>;
  wsConnected: boolean;
  lastUpdated: string;
}
```

### 8.2 KpiCard — KPI 数字卡片

```typescript
interface KpiCardProps {
  title: string;
  value: number | string;
  unit?: string;             // 元/次/%
  prevValue?: number;
  change?: string;           // 变化率，如"+12.5%"
  changePositive?: boolean;  // 正变化是否为好事
  status?: "normal" | "warning" | "critical";
  progress?: { current: number; target: number };  // 进度条
  animate?: boolean;         // 是否启用数字滚动动画
  size?: "lg" | "md" | "sm";
}
```

### 8.3 RealtimeChart — 实时图表

```typescript
interface RealtimeChartProps {
  type: "line" | "bar" | "heatmap" | "pie";
  dataSource: string;        // 数据源标识
  refreshInterval: number;   // ms
  timeRange?: "24h" | "7d" | "30d";
  height?: number;
  showLegend?: boolean;
  showTooltip?: boolean;
  darkMode?: boolean;        // 大屏深色主题专用配色
}
```

### 8.4 AlertEventStream — 告警事件流

```typescript
interface AlertEventStreamProps {
  maxEvents?: number;        // 最多展示条数，默认 20
  maxHeight?: string;
  filter?: { level?: string[]; source?: string[] };
}

interface AlertEvent {
  id: string;
  level: "info" | "warning" | "critical";
  title: string;
  message: string;
  source: string;
  timestamp: string;
}
```

### 8.5 VendorStatusPanel — 供应商健康状态面板

```typescript
interface VendorStatusPanelProps {
  // 无外部 props，自动拉取 vendor_health 数据
}

interface VendorStatus {
  vendorName: string;
  vendorLogo?: string;
  status: "online" | "degraded" | "offline" | "maintenance";
  uptime24h: number;         // 百分比
  avgLatency: number;        // ms
  errorRate24h: number;      // 百分比
  activeConnections: number;
  lastCheckedAt: string;
}
```

---

## 交叉引用

| 关联模块 | 文档 | 关系 |
|---------|------|------|
| KPI 指标 | ref-1-operational-summary.md | 大屏数据源复用运营KPI API |
| 告警规则 | ref-5.4-alert-rules.md | 大屏告警事件流源数据 |
| 供应商管理 | ref-4.3-vendor-model.md | 大屏供应商健康面板数据源 |
| 管理看板 | ref-4.1-admin-dashboard.md | 二者共享数据，大屏为全屏增强版 |
| 系统配置 | ref-4.8-system-config.md | 大屏配置存储在 site_configs |
