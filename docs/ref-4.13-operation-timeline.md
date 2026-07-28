# 操作轨迹时间线 — 深化参考文档

> **对应章节**：[PRD-README.md §4.7 监控与日志](../PRD-README.md#47-监控与日志) + [§2.1.3 多管理员协作与操作审计](../PRD-README.md#213-多管理员协作与操作审计) — 深化模块
> **状态**：新功能。基于已有 `audit_logs` 和敏感操作日志，构建可视化时间线和异常检测。
> **定位**：将离散的操作日志重构为按用户/操作类型的时间线视图，支持一键查看用户全生命周期操作轨迹。
> **粒度**：数据模型 → 时间线 UI → 异常标注 → API → 组件 Props

---

## 目录

1. [数据模型增强](#1-数据模型增强)
2. [用户级操作轨迹](#2-用户级操作轨迹)
3. [全局操作时间线](#3-全局操作时间线)
4. [异常操作检测](#4-异常操作检测)
5. [敏感操作追溯](#5-敏感操作追溯)
6. [API 接口规格](#6-api-接口规格)
7. [前端组件 Props](#7-前端组件-props)

---

## 1. 数据模型增强

### 1.1 基于现有 audit_logs 表扩展

现有 `audit_logs` 表已有基础字段，为支持时间线可视化，需扩展以下字段：

```typescript
// 新增字段（ALTER TABLE 迁移）
export const auditLogExtensions = {
  // 操作会话ID：同一登录会话的所有操作共享
  sessionId: varchar("session_id", { length: 64 }),
  // 操作耗时(ms)：操作处理时间
  durationMs: integer("duration_ms"),
  // 操作链路ID：关联操作（如"用户禁用→余额冻结"）
  traceId: varchar("trace_id", { length: 64 }),
  // 操作地理位置：IP 解析结果
  geoLocation: jsonb("geo_location").$type<GeoLocation>(),
  // 操作设备信息：UA 解析结果
  deviceInfo: jsonb("device_info").$type<DeviceInfo>(),
  // 风险评分：异常操作检测评分 0-100
  riskScore: integer("risk_score"),
  // 风险标签：异常类型
  riskTags: jsonb("risk_tags").$type<string[]>(),
};

interface GeoLocation {
  country: string;
  province: string;
  city: string;
  isp: string;
}

interface DeviceInfo {
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  device: string; // desktop | mobile | tablet
}
```

### 1.2 操作聚合索引

```sql
-- 按用户的时间线索引
CREATE INDEX audit_logs_user_time ON audit_logs (user_id, created_at DESC);

-- 按操作对象+时间
CREATE INDEX audit_logs_target_time ON audit_logs (target_type, target_id, created_at DESC);

-- 按会话
CREATE INDEX audit_logs_session ON audit_logs (session_id, created_at DESC);

-- 按操作类型+时间（用于全局时间线）
CREATE INDEX audit_logs_action_time ON audit_logs (action, created_at DESC);

-- 风险评分索引
CREATE INDEX audit_logs_risk ON audit_logs (risk_score DESC) WHERE risk_score IS NOT NULL;
```

---

## 2. 用户级操作轨迹

### 2.1 用户详情页时间线

**入口**：管理端 → 用户详情页 → 「操作轨迹」Tab

**时间线展示**：

```
┌─ 用户操作轨迹: 张三 (u_10086) ──────────────────────┐
│                                                      │
│ 时间范围: [7天 ▼] [30天] [90天] [全部]              │
│ 操作类型: [全部 ▼]  [显示异常操作 ☑]                 │
│                                                      │
│ ── 2026-07-28 ─────────────────────────────────────  │
│                                                      │
│  10:35 ⚙️ 消费扣费                                   │
│  │    调用 deepseek-chat，消耗 1,234 tokens          │
│  │    费用 ¥0.0123，余额: ¥234.50 → ¥234.4877       │
│  │    IP: 117.78.2.66 · 北京, 移动                   │
│  │                                                    │
│  10:30 🔑 Key 创建                                    │
│  │    创建 API Key "生产环境-主Key"                  │
│  │    权限: 全部模型 · 无过期                         │
│  │    IP: 117.78.2.66 · 北京, 移动                   │
│  │                                                    │
│  09:00 🔐 登录成功                                    │
│  │    用户名+密码登录                                │
│  │    IP: 117.78.2.66 · 北京, 移动                   │
│  │    Chrome 126 / Windows 10                        │
│  │                                                    │
│ ── 2026-07-27 ─────────────────────────────────────  │
│                                                      │
│  23:15 🔴 异常登录 ⚠️ 风险评分: 85                   │
│  │    登录失败 × 5（密码错误）                       │
│  │    IP: 45.33.xxx.xxx · 纽约, USA                 │
│  │    🏷 异地登录 · 密码爆破嫌疑 · 来自风险国家      │
│  │                                                    │
│  18:30 💰 充值                                        │
│  │    支付宝充值 ¥200.00                             │
│  │    余额: ¥34.50 → ¥234.50                         │
│  │    IP: 117.78.2.66 · 北京, 移动                   │
│  │                                                    │
└──────────────────────────────────────────────────────┘
```

### 2.2 时间线节点类型

| 节点类型 | 图标 | 颜色 | 包含操作 |
|---------|------|------|---------|
| 登录 | 🔐 | 蓝色 | 登录成功/登录失败/退出登录 |
| 密钥管理 | 🔑 | 紫色 | Key 创建/编辑/禁用/删除/重新生成 |
| 余额变动 | 💰 | 绿色 | 充值/消费/退款/平台调整/兑换码 |
| 资料变更 | 👤 | 青色 | 修改昵称/邮箱/密码/实名 |
| 安全事件 | 🛡️ | 红色 | 异常登录/密码错误/IP变更/封禁 |
| 设置变更 | ⚙️ | 灰色 | 修改偏好/通知设置/API配置 |
| 管理操作 | 👑 | 黄色 | 管理员对用户的任何操作(仅管理端可见) |

### 2.3 时间线交互

| 交互 | 行为 |
|------|------|
| 点击节点 | 展开显示完整操作详情（before/after 值对比、完整IP/UA、备注） |
| 右键节点 | 复制操作ID、复制IP、查看IP详细地理位置 |
| 筛选异常事件 | 仅展示风险评分 > 50 的操作 |
| "导出操作轨迹"按钮 | 导出选定时间范围的所有操作为 PDF/CSV |
| 虚拟滚动 | 超过 100 条记录时启用虚拟滚动，仅渲染可视区域 |

---

## 3. 全局操作时间线

### 3.1 管理端页面

**路径**：`/admin/logs/operation-timeline`

**页面布局**：

```
┌─ 全局操作时间线 ────────────────────────────────────────┐
│ 实时 ⦿ 已暂停                                             │
│                                                           │
│ [时间筛选: 今天 ▼] [操作类型: 全部 ▼] [角色: 全部 ▼]    │
│ [搜索: 用户/操作对象/备注 ████████████]                  │
│ ☑ 仅敏感操作  ☑ 仅异常  ☑ 仅管理员操作                   │
│                                                           │
│ ── 10:35 ───────────────────────────────────────────────  │
│                                                           │
│ [张三·admin] 修改模型价格                                  │
│     deepseek-chat 售价: ¥0.002 → ¥0.003                │
│     IP: 192.168.1.1  |  设备: Chrome/Win                 │
│                                                           │
│ [李四·finance] 提现审核通过                               │
│     申请金额 ¥5000  |  审核意见: "已核实"                  │
│     IP: 192.168.1.2  |  设备: Chrome/Win                 │
│                                                           │
│ ── 10:34 ───────────────────────────────────────────────  │
│                                                           │
│ [系统·SYSTEM] 🔴 自动封禁用户 u_12345                    │
│     触发规则: 失败率 > 10% 持续 5 分钟                     │
│     风险评分: 92  |  ⚠️ 高风险                            │
│                                                           │
│ [王五·support] 调整用户余额                               │
│     u_10087 余额: ¥500.00 → ¥300.00                    │
│     理由: "用户申请退款"                                   │
│     👑 敏感操作(超阈值需二次确认)                          │
└──────────────────────────────────────────────────────────┘
```

### 3.2 实时流模式

全局时间线支持"实时流"模式（默认启用）：

- WebSocket 推送新的操作事件，实时插入时间线顶部
- 新事件插入时带淡入动画（300ms）
- 每秒最多展示 10 条，超过的放入"+N 条"折叠按钮
- "暂停"按钮：冻结时间线，但继续在后台收集，恢复后批量插入
- "滚动锁定"：自动跟随最新事件滚动 / 手动滚动后暂时解锁 5s

---

## 4. 异常操作检测

### 4.1 检测规则

| 检测类型 | 规则 | 风险评分 | 风险标签 |
|---------|------|---------|---------|
| 夜间异常操作 | 操作时间 23:00-06:00 且为敏感操作 | 60 | `night_operation` |
| 高频操作 | 5 分钟内同类型操作 > 10 次 | 70 | `high_frequency` |
| IP 突变 | IP 地址与最近 24h 常用 IP 不同城市 | 65 | `ip_change` |
| 异地操作 | 与前次操作地理位置 > 500km | 75 | `geo_anomaly` |
| 风险国家IP | IP 来自非中国/非合作国家 | 80 | `risk_country` |
| 连续失败操作 | 同一操作连续失败 > 3 次 | 55 | `consecutive_failure` |
| 超大数据量导出 | 单次导出 > 10000 条 | 40 | `large_export` |
| 短时间内大量删改 | 10 分钟内 DELETE/UPDATE > 5 个不同对象 | 85 | `mass_mutation` |
| 非工作时间敏感操作 | 工作日 18:00-09:00 或周末的敏感操作 | 50 | `off_hours_sensitive` |

### 4.2 风险评分计算

```
总评分 = SUM(各规则评分 × 规则权重)

规则权重:
  - 高频操作: 1.2
  - 异地操作: 1.5
  - 风险国家IP: 2.0
  - 连续失败: 0.8
  - 其他: 1.0

展示逻辑:
  0-30: 正常（白色）
  31-50: 可疑（黄色底 + 🟡）
  51-70: 异常（红色底 + 🔴）
  71-100: 高危（深红底闪烁 + 🚨）
```

### 4.3 异常告警联动

风险评分 > 70 → 自动推送到安全事件面板 + 站内通知安全管理员

---

## 5. 敏感操作追溯

### 5.1 敏感操作列表视图

**路径**：`/admin/logs/sensitive-operations`

| 列 | 说明 |
|----|------|
| 时间 | 操作时间 |
| 操作人 | 管理员昵称+角色 |
| 操作类型 | 余额调整/角色变更/价格变更/提现审核 等 |
| 操作对象 | 受影响的用户/资源 |
| 变化 | 前后值对比（如：¥500 → ¥300） |
| 原因 | 操作备注 |
| IP | 操作来源 IP |
| 风险评分 | 彩色标签 |
| 操作 | 查看完整上下文 |

**与普通操作日志的区别**：
- 敏感操作采用**红色高亮**行背景
- 前后值对比直接展示在列表中（无需展开）
- 额外展示"二次确认"记录（是否弹窗确认/确认时间）
- 超阈值操作展示额外标记"⚠️ 已通知 super_admin"

---

## 6. API 接口规格

### 6.1 用户操作轨迹

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/users/:id/timeline` | 用户操作轨迹 | USER_VIEW |
| GET | `/api/v1/admin/users/:id/timeline/summary` | 轨迹摘要（统计） | USER_VIEW |
| GET | `/api/v1/admin/users/:id/timeline/export` | 导出轨迹 | USER_EDIT |

**查询参数**：

```
?startTime=2026-07-01T00:00:00Z
&endTime=2026-07-31T23:59:59Z
&actionTypes=login,balance,security    // 筛选操作类型
&onlyAnomalies=true                     // 仅异常事件
&includeSystemActions=true              // 包含系统自动操作
&page=1&pageSize=50
```

**轨迹摘要响应**：

```json
{
  "code": 0,
  "data": {
    "totalOperations": 1234,
    "dateRange": { "first": "2026-01-15T08:30:00Z", "last": "2026-07-28T10:35:00Z" },
    "typeDistribution": [
      { "type": "api_call", "count": 890, "ratio": 72.1 },
      { "type": "login", "count": 180, "ratio": 14.6 },
      { "type": "balance_change", "count": 87, "ratio": 7.1 },
      { "type": "key_management", "count": 45, "ratio": 3.6 },
      { "type": "profile_change", "count": 20, "ratio": 1.6 },
      { "type": "admin_action", "count": 12, "ratio": 1.0 }
    ],
    "riskStats": {
      "totalRiskEvents": 5,
      "highRiskEvents": 2,
      "topRiskTag": "geo_anomaly",
      "avgRiskScore": 62
    },
    "deviceStats": {
      "uniqueDevices": 3,
      "uniqueLocations": 4,
      "primaryDevice": "Chrome 126 / Windows 10",
      "primaryLocation": "北京, 中国"
    },
    "anomalySummary": [
      { "date": "2026-07-27", "type": "异常登录", "riskScore": 85, "detail": "凌晨3点异地登录失败×5" },
      { "date": "2026-07-20", "type": "大量导出", "riskScore": 40, "detail": "导出50000条调用日志" }
    ]
  }
}
```

### 6.2 全局操作时间线

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/operations/timeline` | 全局时间线（分页） | USER_VIEW |
| GET | `/api/v1/admin/operations/timeline/realtime` | 实时操作流(WS) | USER_VIEW |

**WebSocket**：`/ws/admin/operations`

### 6.3 敏感操作

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/operations/sensitive` | 敏感操作列表 | USER_VIEW |

---

## 7. 前端组件 Props

### 7.1 UserTimeline — 用户操作轨迹

```typescript
interface UserTimelineProps {
  userId: number;
  timeRange?: "7d" | "30d" | "90d" | "all";
  actionTypes?: string[];
  onlyAnomalies?: boolean;
  maxHeight?: string | number;
  showExport?: boolean;
  onEventClick?: (event: TimelineEvent) => void;
}

interface TimelineEvent {
  id: number | string;
  timestamp: string;
  type: "login" | "key_management" | "balance_change" | "profile_change" | "security_event" | "settings_change" | "admin_action";
  icon: string;
  color: string;
  title: string;
  description: string;
  details?: Record<string, any>;  // 展开后的详情
  ip?: string;
  geoLocation?: GeoLocation;
  deviceInfo?: DeviceInfo;
  riskScore?: number;
  riskTags?: string[];
  isAnomaly: boolean;
}
```

### 7.2 GlobalOperationTimeline — 全局操作时间线

```typescript
interface GlobalOperationTimelineProps {
  autoScroll?: boolean;
  filters?: GlobalTimelineFilters;
  onPause?: () => void;
  onResume?: () => void;
}

interface GlobalTimelineFilters {
  timeRange?: string;       // today | 24h | 7d | custom
  actionTypes?: string[];
  roles?: string[];
  keyword?: string;
  onlySensitive?: boolean;
  onlyAnomalies?: boolean;
  onlyAdmins?: boolean;
}

interface GlobalTimelineEvent {
  id: number;
  timestamp: string;
  operator: {
    id: number;
    nickname: string;
    role: string;
    avatar?: string;
  };
  action: string;
  actionLabel: string;      // 可读的操作描述
  target?: {
    type: string;
    id: number;
    name: string;
  };
  change?: {
    before: any;
    after: any;
  };
  reason?: string;
  ip: string;
  device: string;
  geoLocation?: string;     // 格式化后的地理位置
  riskScore?: number;
  isSensitive: boolean;
  isAnomaly: boolean;
  isSystem: boolean;        // 系统自动操作
}
```

### 7.3 RiskScoreBadge — 风险评分徽章

```typescript
interface RiskScoreBadgeProps {
  score: number;
  tags?: string[];
  showTags?: boolean;
  size?: "sm" | "md" | "lg";
}
```

---

## 交叉引用

| 关联模块 | 文档 | 关系 |
|---------|------|------|
| 审计日志 | ref-4.7-monitor-logs.md | 基于 audit_logs 数据构建时间线视图 |
| 安全风控 | ref-4.6-security.md | 异常检测规则引擎驱动风险评分 |
| 用户管理 | PRD-README.md §2.1 | 用户详情页集成操作轨迹Tab |
| 操作日志 | PRD-README.md §2.1.3 | 敏感操作列表复用现有操作日志 |
| 告警规则 | ref-5.4-alert-rules.md | 高风险操作触发告警通知 |
