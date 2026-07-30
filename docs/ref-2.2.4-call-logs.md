# 用户端调用日志深化文档

> **对应章节**：PRD-README.md §2.2.4 调用日志 `/console/logs`
> **最后更新**：2026-07-28
> **定位**：用户端调用日志的列表、筛选、导出、异常分析完整规格

---

## 一、页面组件树

```
CallLogs
├── LogFilterBar
│   ├── QuickTimeRange（15分钟/1小时/今天/昨天/7天/30天/自定义）
│   ├── CustomDateRange（从/到日期选择器）
│   ├── ModelFilter（多选下拉，全部模型/指定模型）
│   ├── StatusFilter（✅成功/❌失败/⏳超时，至少选一个）
│   ├── RequestIdInput（精确匹配）
│   ├── KeyFilter（当前用户的所有 Key）
│   ├── [Apply] [Reset] 按钮
│   └── SavedPresets（保存/加载/管理筛选预设）
│
├── LogTable
│   ├── ColumnHeaders（时间/模型/状态/Token/耗时/费用/请求ID/错误）
│   ├── LogRow × N（默认最近 500 条，倒序）
│   └── InfiniteScroll / VirtualScroll（超过 500 条）
│
├── ExportToolbar
│   ├── FormatSelector（CSV/JSON/Excel）
│   ├── RangeSelector（当前页/全部结果，上限 10 万条）
│   └── ExportButton
│
├── ExportProgressModal（导出超过 1 万条时）
│   ├── 进度条
│   └── 完成后通知下载
│
└── ErrorAnalysisPanel
    ├── ErrorSummary（总失败率 + 按类型聚合柱状图）
    ├── ErrorRateTrend（近 24 小时错误率折线图）
    └── FailedRequestList（最近 100 条失败请求明细）
```

---

## 二、前端组件 Props

```typescript
// LogFilterBar 筛选栏
interface LogFilterBarProps {
  filters: LogFilters;
  onFilterChange: (filters: LogFilters) => void;
  onApply: () => void;
  onReset: () => void;
  modelOptions: { id: string; name: string }[];
  keyOptions: { id: number; alias: string }[];
  presets: SavedFilterPreset[];
  onSavePreset: (name: string) => void;
  onLoadPreset: (presetId: string) => void;
  onDeletePreset: (presetId: string) => void;
}

interface LogFilters {
  timeRange: '15m' | '1h' | 'today' | 'yesterday' | '7d' | '30d' | 'custom' | null;
  customRange?: { from: string; to: string };
  models: string[];                    // 空 = 全部模型
  statuses: ('success' | 'failure' | 'timeout')[];  // 至少选一个
  requestId?: string;
  keyId?: number;
}

interface SavedFilterPreset {
  id: string;
  name: string;
  filters: LogFilters;
  createdAt: string;
}

// LogTable 日志列表
interface LogTableProps {
  logs: CallLog[];
  totalCount: number;
  loading: boolean;
  onLoadMore: () => void;
  hasMore: boolean;
}

interface CallLog {
  id: number;
  timestamp: string;
  model: string;
  vendor: string;
  status: 'success' | 'failure' | 'timeout';
  promptTokens: number;
  completionTokens: number;
  duration: number;                    // 毫秒
  cost: string;
  requestId: string;
  errorCode?: string;
  errorMessage?: string;
  apiKeyAlias?: string;               // 使用的 Key 别名
}

// ExportToolbar 导出工具栏
interface ExportToolbarProps {
  format: 'csv' | 'json' | 'xlsx';
  onFormatChange: (format: 'csv' | 'json' | 'xlsx') => void;
  exportRange: 'current' | 'all';
  onRangeChange: (range: 'current' | 'all') => void;
  onExport: () => void;
  totalCount: number;                  // 总条数，用于判断是否异步
  exporting: boolean;
}

// ExportProgressModal 导出进度弹窗
interface ExportProgressModalProps {
  open: boolean;
  progress: number;                    // 0-100
  estimatedSize?: string;
  onDownload: () => void;              // 完成后出现
  onClose: () => void;
}

// ErrorAnalysisPanel 异常分析面板
interface ErrorAnalysisPanelProps {
  totalFailures: number;
  failureRate: number;                 // 百分比
  byErrorType: ErrorTypeStat[];
  errorRateTrend: TrendDataPoint[];    // 近 24 小时
  failedRequests: CallLog[];           // 最近 100 条
  loading: boolean;
}

interface ErrorTypeStat {
  errorType: string;
  count: number;
  percentage: number;
  description: string;
}

interface TrendDataPoint {
  time: string;                        // HH:mm
  rate: number;                        // 错误率百分比
  isAnomaly: boolean;                  // 是否 > 5%
}
```

---

## 三、API 接口

| 方法 | 路径 | 说明 | 分页 |
|------|------|------|------|
| `GET` | `/api/v1/me/logs` | 调用日志列表 | ✅ |
| `GET` | `/api/v1/me/logs/error-analysis` | 异常分析聚合 | — |
| `GET` | `/api/v1/me/logs/error-rate-trend` | 错误率趋势 | — |
| `POST` | `/api/v1/me/logs/export` | 发起日志导出 | — |
| `GET` | `/api/v1/me/logs/exports` | 导出记录列表 | ✅ |
| `GET` | `/api/v1/me/logs/exports/:id/download` | 下载导出文件 | — |

### 3.1 日志列表请求

```json
GET /api/v1/me/logs?time_range=7d&models=deepseek-chat&statuses=failure&page=1&limit=50

Response:
{
  "data": [
    {
      "id": 123456,
      "timestamp": "2026-07-28T10:30:00.123+08:00",
      "model": "deepseek-chat",
      "vendor": "DeepSeek",
      "status": "failure",
      "prompt_tokens": 234,
      "completion_tokens": 0,
      "duration": 1234,
      "cost": "0.0000",
      "request_id": "req_abc123def456",
      "error_code": "rate_limit_exceeded",
      "error_message": "Rate limit exceeded. Please try again later.",
      "api_key_alias": "生产环境-主Key"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 12345,
    "total_pages": 247
  }
}
```

### 3.2 异常分析

```json
GET /api/v1/me/logs/error-analysis?time_range=24h

Response:
{
  "total_failures": 234,
  "total_calls": 10174,
  "failure_rate": 2.3,
  "by_error_type": [
    { "error_type": "auth_failed", "count": 89, "percentage": 38.0 },
    { "error_type": "insufficient_balance", "count": 67, "percentage": 28.6 },
    { "error_type": "rate_limit_exceeded", "count": 45, "percentage": 19.2 },
    { "error_type": "model_unavailable", "count": 23, "percentage": 9.8 },
    { "error_type": "timeout", "count": 10, "percentage": 4.3 }
  ],
  "error_rate_trend": [
    { "time": "2026-07-27T14:00:00+08:00", "rate": 1.2, "is_anomaly": false },
    { "time": "2026-07-27T15:00:00+08:00", "rate": 6.5, "is_anomaly": true }
  ]
}
```

### 3.3 日志导出

```json
POST /api/v1/me/logs/export
{
  "format": "csv",
  "filters": {
    "time_range": "7d",
    "statuses": ["failure"]
  }
}

Response 202:
{
  "export_id": "exp_xyz789",
  "status": "pending",
  "estimated_size": "2.5 MB",
  "download_url": null
}
```

---

## 四、核心逻辑

### 4.1 默认加载

| 规则 | 值 |
|------|-----|
| 默认时间范围 | 最近 7 天 |
| 默认排序 | 时间倒序 |
| 默认条数 | 最近 500 条 |
| 加载超时 | 首次加载不超过 500ms |
| 超过 500 条 | 自动启用虚拟滚动 |

### 4.2 筛选预设

| 特性 | 说明 |
|------|------|
| 存储位置 | 服务端 `user_preferences` |
| 同步 | 多设备同步 |
| 保存 | 命名 + 当前筛选条件快照 |
| 加载 | 从已保存预设列表中选择 |
| 管理 | 编辑名称 / 删除 / 设为默认 |

### 4.3 导出规则

| 规则 | 说明 |
|------|------|
| 当前页 | 直接导出当前页数据 |
| 全部结果 | 导出符合筛选条件的所有数据 |
| 上限 | 最多 100,000 条 |
| 超过 10,000 条 | 异步生成，生成后通知下载 |
| 导出保留 | 7 天，过期自动清理 |
| 导出通知 | 站内通知 + 邮件（可选） |

### 4.4 异常分析阈值

| 指标 | 阈值 | 标记 |
|------|------|------|
| 错误率 | > 5% | 异常时段（红色区域标记） |
| 错误率 | 3%-5% | 关注时段（黄色区域标记） |
| 错误率 | < 3% | 正常时段 |

---

## 五、数据流

```mermaid
sequenceDiagram
    participant U as 用户
    participant L as 调用日志页面
    participant API as 后端 API
    participant DB as 数据库

    U->>L: 打开调用日志页
    L->>API: GET /me/logs?time_range=7d&limit=500
    API->>DB: 查询 call_logs（order by time DESC）
    DB-->>API: 返回最近 500 条
    API-->>L: 渲染日志列表

    U->>L: 设置筛选条件 → 点击应用
    L->>API: GET /me/logs?[筛选参数]
    API->>DB: 按条件查询
    DB-->>API: 返回筛选结果
    API-->>L: 更新渲染

    U->>L: 点击异常分析
    L->>API: GET /me/logs/error-analysis?time_range=24h
    API->>DB: 聚合查询（error_type + count + 趋势）
    DB-->>API: 返回聚合数据
    API-->>L: 渲染异常分析面板

    U->>L: 点击导出
    L->>API: POST /me/logs/export
    alt 条数 <= 10000
        API-->>L: 直接返回文件
    else 条数 > 10000
        API-->>L: 返回 202 + export_id
        ALT-->>API: 异步生成文件
        API->>U: 通知下载
    end
```

---

## 六、交叉引用

| 其他文档 | 关联内容 |
|---------|---------|
| PRD-README.md §2.2.4 | 调用日志总纲 |
| ref-4.7-monitor-logs.md | 管理后台日志（操作日志/审计日志） |
| ref-4.6-security.md | 安全事件（失败请求关联安全事件） |
| data-dictionary.md §2.2 | call_logs 字段定义 |
| ref-4.9-report-testing.md | 报表导出（日志导出格式参考） |

---

## 边界条件

### 日志查询与导出场景

| # | 场景 | 触发条件 | 预期行为 |
|---|------|---------|---------|
| CLOG-001 | 日志查询时间跨度太大 | 用户选择自定义时间范围超过 90 天（如整年） | API 返回 400 错误，提示「查询时间跨度最大为 90 天，请缩小时间范围」，前端日期选择器高亮提示 |
| CLOG-002 | 日志数据被归档 | 用户查询的时间范围超过 `call_logs` 在线保留期（如 > 6 个月），数据已被归档到冷存储 | 返回空列表并提示「所选时间范围的日志已归档，如需查询请联系技术支持」|
| CLOG-003 | 实时日志 WebSocket 断连 | 网络波动或服务端重启导致实时活动流连接断开 | 前端显示断线重连提示「连接已断开，正在重连...」，自动每 5 秒尝试重连，最多 15 次；重连成功后自动补发断连期间的日志摘要 |
| CLOG-004 | 日志导出超限 | 用户试图导出超过 100,000 条记录，超出系统上限 | 前端提示「最多导出 100,000 条记录，请缩小时间范围」，导出按钮置灰，ExportToolbar 展示已选条数/上限警告 |
| CLOG-005 | 异常分析面板无失败数据 | 所选时间范围内没有任何失败或超时调用记录 | ErrorSummary 展示「暂无异常」，错误率趋势图展示 0% 平线，隐藏 FailedRequestList |

### 异常流程

| 场景 | 恢复策略 |
|------|---------|
| 日志列表 InfiniteScroll 加载下一页超时 | 展示「加载更多失败」提示按钮，点击手动重试，不自动刷新当前页 |
| 导出异步任务队列积压 | 异步导出进入队列排队，前端显示排队位置（如「第 3 位」），预估等待时间 |
| 筛选预设保存时服务端写入失败 | 降级为 localStorage 本地存储，页面提示「预设已保存到本地，下次将尝试同步到云端」|