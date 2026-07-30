# 深化参考：§12.5 在线日志查看器

> **对应**：[`PRD-系统管理员支撑.md`](PRD-系统管理员支撑.md) §12.5
> **关联**：[`ref-12.6-health-dashboard.md`](ref-12.6-health-dashboard.md)、[`ref-4.7-monitor-logs.md`](ref-4.7-monitor-logs.md)、[`ref-12.4-task-scheduler.md`](ref-12.4-task-scheduler.md)
> **优先级**：P1 | **状态**：需求文档（待开发）
> **最后更新**：2026-07-30

---

## 概述

运维人员和开发人员在排查问题时需要查看服务器日志。当前需要通过 SSH 登录服务器使用 `tail` / `grep` 命令操作，不直观且存在安全风险（直接 SSH 到生产环境）。

**核心价值**：浏览器端在线查看、搜索、过滤、实时 tail 日志文件，无需 SSH 登录服务器，操作安全可审计。

---

## 功能模块

### 1. 日志文件列表

展示可用的日志文件：

| 文件名称 | 说明 | 大小 | 最后修改 | 操作 |
|----------|------|------|---------|------|
| `api-error.log` | API 服务错误日志 | 12.3 MB | 2026-07-30 15:20 | [查看] [下载] |
| `api-access.log` | API 访问日志 | 45.8 MB | 2026-07-30 15:25 | [查看] [下载] |
| `nginx-error.log` | Nginx 错误日志 | 2.1 MB | 2026-07-30 15:20 | [查看] [下载] |
| `deploy.log` | 部署日志 | 5.6 MB | 2026-07-29 10:00 | [查看] [下载] |

**日志目录配置**：仅暴露预配置的日志目录（如 `/root/3cloud/logs/`），不支持路径遍历。

**文件大小限制**：默认仅展示日志目录下 ≤ 500MB 的文件，超大文件需在配置中显式添加。

### 2. 实时 Tail

通过 WebSocket 实现实时日志滚动：

```
┌─────────────────────────────────────────────────────────┐
│  📁 api-error.log     🔴 LIVE   ⏸ 暂停  ⬇ 下载  🔍 搜索 │
├─────────────────────────────────────────────────────────┤
│ 2026-07-30 15:20:12 ERROR [AuthService] 登录失败:       │
│   用户 admin (IP: 10.0.0.1) 密码错误 3 次               │
│ 2026-07-30 15:20:15 ERROR [RateLimiter] 速率限制触发:    │
│   用户 ID: 1283, 模型: deepseek-v4, 超限 2 倍            │
│ 2026-07-30 15:21:00 WARN  [Billing] 余额不足提醒:        │
│   用户 ID: 562, 当前余额 ¥0.50                           │
│ 2026-07-30 15:22:10 INFO  [HealthCheck] 所有服务正常     │
│ 2026-07-30 15:23:00 ERROR [DB] 连接池耗尽:               │
│   活动连接 50/50, 等待队列 12                            │
│                                                          │
│  ── 等待新日志... ──                                     │
└─────────────────────────────────────────────────────────┘
```

| 功能 | 说明 |
|------|------|
| 实时滚动 | WebSocket 推送新日志行，自动滚动到最底部 |
| 暂停/继续 | 暂停实时滚动，可向上翻看历史；恢复后自动回到底部 |
| 清屏 | 清空当前视图，重新开始接收实时日志 |

### 3. 时间范围筛选

按时间截取日志段落：

| 参数 | 说明 |
|------|------|
| 开始时间 | 日志开始截取时间点 |
| 结束时间 | 日志结束截取时间点 |
| 偏移量 | 从文件开头跳过的行数（offset）|
| 限制行数 | 返回的最大行数（limit）|

- 默认返回文件末尾 200 行（相当于 `tail -n 200`）
- 时间筛选基于日志行中的时间戳正则匹配
- 未匹配时间戳的行视为上一行时间戳的延续

### 4. 关键词搜索

在已加载的日志中搜索包含关键词的行：

| 功能 | 说明 |
|------|------|
| 搜索范围 | 当前已加载的日志内容 |
| 匹配方式 | 区分大小写 / 不区分大小写 |
| 高亮 | 匹配关键词在行内高亮 |
| 上下文 | 显示匹配行前后 N 行 |
| 结果导航 | 上一个/下一个匹配结果 |

**服务端搜索**：当需要搜索整个文件时，使用 `GET /api/v1/admin/logs/read` 并传入 `q` 参数，后端执行 grep 操作。

### 5. 日志级别过滤

通过日志级别标签过滤显示：

| 级别 | 颜色标识 | 说明 |
|------|---------|------|
| `ERROR` | 🔴 红色 | 错误日志 |
| `WARN` | 🟡 黄色 | 警告日志 |
| `INFO` | 🔵 蓝色 | 信息日志 |
| `DEBUG` | ⚪ 灰色 | 调试日志 |

- 支持多选过滤（如仅显示 ERROR + WARN）
- 过滤基于日志行中的级别关键字匹配
- 级别标签默认按 `ERROR > WARN > INFO > DEBUG` 排序

### 6. 日志下载

| 方式 | 说明 |
|------|------|
| 当前视图下载 | 下载当前筛选后的日志内容 |
| 完整文件下载 | 下载原始日志文件（若超过 100MB 提示压缩后下载）|
| 格式 | `.log` / `.txt` / 可选添加行号 |

---

## API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/v1/admin/logs/files` | 日志文件列表 | 管理员 |
| `GET` | `/api/v1/admin/logs/read` | 读取日志内容 | 管理员 |
| `WS` | `/ws/logs` | WebSocket 实时日志流 | 管理员 |
| `GET` | `/api/v1/admin/logs/download` | 下载日志 | 管理员 |

**日志读取 API 参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `file` | string | 文件名 |
| `offset` | integer | 行偏移 |
| `limit` | integer | 返回行数（默认 200）|
| `level` | string | 级别过滤（`error`/`warn`/`info`/`debug`）|
| `q` | string | 搜索关键词 |
| `startTime` | string | 开始时间（ISO 8601）|
| `endTime` | string | 结束时间（ISO 8601）|

---

## 前端组件 Props

```tsx
// 日志文件列表
interface LogFileListProps {
  files: LogFileSummary[];
  onSelect: (fileName: string) => void;
}

interface LogFileSummary {
  name: string;
  description: string;
  size: number;
  lastModified: string;
  type: string;
}

// 日志查看器
interface LogViewerProps {
  fileName: string;
  initialContent: string[];
  onSearch: (query: string) => void;
  onLevelFilter: (levels: string[]) => void;
  onScroll: (direction: 'up' | 'down') => void;
}

// 实时日志流
interface LogStreamProps {
  fileName: string;
  onLogLine: (line: string) => void;
  live: boolean;
  onPauseToggle: () => void;
}

// 日志过滤器
interface LogFilterProps {
  levels: { key: string; label: string; active: boolean }[];
  onLevelChange: (levels: string[]) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  timeRange?: { start: string; end: string };
  onTimeRangeChange?: (range: { start: string; end: string }) => void;
}

// 日志下载
interface LogDownloadProps {
  fileName: string;
  filtered: boolean; // 是否仅下载当前筛选内容
  onDownload: (options: DownloadOptions) => void;
}

interface DownloadOptions {
  file: string;
  format: 'log' | 'txt';
  addLineNumber: boolean;
  filtered?: boolean;
}

// 日志高亮行
interface LogLineProps {
  lineNumber: number;
  text: string;
  highlight?: string; // 搜索关键词，用于高亮
  level?: 'error' | 'warn' | 'info' | 'debug';
  timestamp?: string;
}
```

---

## 边界条件

| 场景 | 处理方式 |
|------|---------|
| 日志文件不存在 | 提示"日志文件不存在或已被轮转" |
| 日志文件过大（>500MB）| 提示"文件过大，请使用关键词或时间筛选缩小范围后查看" |
| WebSocket 连接断开 | 自动重连（最多 3 次），重连后从断开位置继续接收 |
| 文件正在被写入 | 允许同时读取和写入，使用文件锁避免读取不完整行 |
| 日志轮转（logrotate）| 检测到原文件被替换后自动重连到新文件 |
| 路径遍历尝试（../../etc）| 服务端校验文件名是否在白名单目录内，拒绝非法路径 |
| 搜索无结果 | 显示"未找到匹配内容"，建议调整关键词或扩大时间范围 |
| 时间筛选格式错误 | 返回参数校验错误，提示正确格式（ISO 8601）|
| 日志级别标签不存在 | 不进行过滤，返回所有级别内容 |

---

## 关联模块

| 模块 | 关联方式 |
|------|---------|
| §12.6 健康监控 | 日志查看器可定位健康监控中告警的详细错误 |
| §4.7 监控与日志 | 共享日志目录配置 |
| §12.4 任务调度 | 任务执行失败后可跳转到日志查看器查看详细错误 |
| §12.2 数据库面板 | 数据库错误日志可在日志查看器中查看 |
| §4.6 安全审计 | 日志查看操作需记录审计日志 |

---

### [?] 页面帮助
**页面名称**：在线日志查看器
**核心操作**：选择日志文件 → 实时 tail 查看 → 暂停查看历史 → 关键词搜索/级别过滤 → 下载所需日志段落
**注意事项**：日志查看器仅暴露预配置的日志目录，不支持路径遍历；超大文件（>500MB）需先筛选再查看；实时 tail 需要 WebSocket 连接

### [?] 按钮级帮助对照表
| 按钮/操作 | 帮助说明 |
|----------|---------|
| 文件选择 | 选择要查看的日志文件，列表显示文件名、大小和最后修改时间 |
| 实时 Tail | 打开 WebSocket 连接实时接收新增日志，自动滚动到底部 |
| 暂停/继续 | 暂停实时滚动以查看历史内容，恢复后自动回到最新位置 |
| 关键词搜索 | 在当前加载的日志中搜索包含关键词的行，结果高亮显示 |
| 级别过滤 | 按 ERROR/WARN/INFO/DEBUG 级别筛选日志行 |
| 时间筛选 | 按时间范围截取日志段落，需日志行包含时间戳 |
| 下载 | 下载当前筛选后的日志内容或完整日志文件 |