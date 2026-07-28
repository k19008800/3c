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