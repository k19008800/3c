# 深化参考：§12.6 健康检查大屏

> **对应**：[`PRD-系统管理员支撑.md`](PRD-系统管理员支撑.md) §12.6
> **关联**：[`ref-4.18-kpi-drill-healthcheck.md`](ref-4.18-kpi-drill-healthcheck.md)
> **优先级**：P0 | **状态**：部分后端已实现，前端待完善
> **最后更新**：2026-07-30

---

## 概述

当前有 `/health` 接口返回 200，但管理员需要一个全面的服务健康仪表盘，一眼看到所有服务的运行状态。健康检查大屏提供 6 维度健康评分、实时历史趋势、资源监控和自动诊断。

**核心价值**：一眼掌握系统状态，故障快速定位，健康评分量化。

---

## 功能模块

### 1. 服务状态总览

```
系统健康状态

  ┌─────────────────────────────────────────────────────┐
  │  整体健康评分: 96/100  🟢 良好                       │
  │                                                     │
  │  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
  │  │ API 服务  │  │ 数据库    │  │ Redis    │           │
  │  │ 🟢 可用  │  │ 🟢 正常  │  │ 🟢 正常  │           │
  │  │ 100%     │  │ 99.8%    │  │ 99.9%    │           │
  │  └──────────┘  └──────────┘  └──────────┘           │
  │  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
  │  │ 供应商    │  │ 磁盘      │  │ 安全      │           │
  │  │ 🟢 正常  │  │ 🟡 警告  │  │ 🟢 正常  │           │
  │  │ 32/32    │  │ 78% 使用 │  │ 无异常   │           │
  │  └──────────┘  └──────────┘  └──────────┘           │
  └─────────────────────────────────────────────────────┘
```

### 2. 六维度健康评分

| 维度 | 权重 | 评分依据 | 数据来源 |
|------|------|---------|---------|
| API 可用性 | 30% | 最近 5 分钟 API 请求成功率 | 调用日志聚合 |
| 响应延迟 | 25% | 最近 5 分钟 API 平均/95 分位延迟 | 调用日志聚合 |
| 错误率 | 20% | 最近 5 分钟 API 错误率（非 2xx） | 调用日志聚合 |
| 数据库 | 10% | 连接池使用率、慢查询数、复制延迟 | DB 监控 |
| Redis | 10% | 内存使用率、命中率、连接数 | Redis INFO |
| 安全 | 5% | 未处理的安全事件数、最近登录失败数 | 安全事件表 |

**评分公式**：`总分 = Σ(维度得分 × 权重)`

**颜色规则**：≥ 90 绿 / 70-89 黄 / < 70 红

### 3. 历史可用性趋势

```
近 7 天健康评分趋势

  [折线图：每日健康评分]
  
  100 ┤                ●
   95 ┤  ●─●─●─●─●─●───●
   90 ┤
   85 ┤
      └────────────────────
     07-22 07-23 07-24 07-25 07-26 07-27 07-28
```

### 4. 供应商通道健康

```
供应商通道健康状态

  供应商       通道数   健康   警告   异常   健康率
  DeepSeek    8        8      0      0      100%
  Qwen        6        6      0      0      100%
  GLM         4        3      1      0      75%
  OpenAI      3        2      0      1      67%
  ─────────────────────────────────────────
  合计        32       29     1      2      91%
```

| 健康状态 | 定义 |
|---------|------|
| 健康 | 最近 5 分钟可用率 > 95% |
| 警告 | 最近 5 分钟可用率 90-95% 或响应延迟 > 5s |
| 异常 | 最近 5 分钟可用率 < 90% 或连续失败 > 10 次 |

### 5. 资源监控

```
服务器资源监控

  CPU:   ████████░░ 82%    🔴 高负载
  内存:  ██████░░░░ 62%    🟡 中等
  磁盘:  ███████░░░ 72%    🟢 正常 (40G/55G)
  系统负载: 2.5/1.7/1.2   🟢 正常

  进程内存:
  ├── node (api):      280MB   ████████
  ├── node (web):      120MB   ████
  ├── postgres:        1.2GB   ████████████████████
  ├── redis:           180MB   ██████
  └── nginx:            40MB   █
```

### 6. 自动诊断

一键触发 6 项诊断检查：

| 检查项 | 说明 | 通过条件 |
|--------|------|---------|
| 数据库连接 | 检查数据库连接池是否正常 | 连接成功 + 连接数 < maxConnections × 80% |
| Redis 连接 | 检查 Redis 是否正常响应 | PING 成功 |
| 供应商连通性 | 检查所有供应商 API 是否可达 | 所有供应商最近 1 分钟至少 1 次成功调用 |
| 磁盘写入 | 检查日志目录/上传目录是否可写 | 测试文件写入成功 |
| 进程内存 | 检查各进程内存是否超过阈值 | node 进程 < 512MB，postgres < 2GB |
| 系统资源 | 检查 CPU/内存/磁盘是否超过阈值 | CPU < 90%，内存 < 85%，磁盘 < 90% |

---

## API 接口

| 方法 | 路径 | 状态 | 说明 | 权限 |
|------|------|------|------|------|
| `GET` | `/api/v1/admin/health/overview` | ✅ 已实现 | 服务状态总览 + 供应商通道健康统计 | security_view |
| `GET` | `/api/v1/admin/health-score` | ✅ 已实现 | 6 维度健康评分 + 加权总分 | security_view |
| `GET` | `/api/v1/admin/health-score/history?days=7` | ✅ 已实现 | 近 7 天趋势 | security_view |
| `GET` | `/api/v1/admin/health/service/:name` | ✅ 已实现 | 单个服务详情 (api/database/redis) | security_view |
| `GET` | `/api/v1/admin/health/resources` | ✅ 已实现 | CPU/内存/磁盘/系统信息 | security_view |
| `POST` | `/api/v1/admin/health/diagnose` | ✅ 已实现 | 6 项自动诊断 | security_view |
| `GET` | `/api/v1/admin/health/vendors` | 待实现 | 供应商通道健康详表 | security_view |

---

## 前端组件 Props

```tsx
// 健康总览大屏
interface HealthDashboardProps {
  overview: HealthOverview;
  score: HealthScore;
  scoreHistory: ScoreHistoryPoint[];
  resources: ResourceMetrics;
  vendorHealth: VendorHealth[];
  diagnoseResult?: DiagnoseResult;
  onRefresh: () => void;
  onDiagnose: () => Promise<void>;
  onServiceClick: (name: string) => void;
  loading: boolean;
  lastUpdated: Date;
}

// 健康评分卡片
interface HealthScoreCardProps {
  score: HealthScore;
  dimensions: { name: string; score: number; weight: number }[];
  history: ScoreHistoryPoint[];
}

// 资源监控组件
interface ResourceMonitorProps {
  cpu: { usage: number; cores: number };
  memory: { used: number; total: number };
  disk: { used: number; total: number };
  load: { current: number; cores: number };
  processes: { name: string; memory: number; status: 'ok' | 'warn' | 'critical' }[];
}

// 供应商通道健康表
interface VendorHealthTableProps {
  vendors: VendorHealth[];
  onVendorClick: (name: string) => void;
}

// 诊断结果展示
interface DiagnoseResultProps {
  items: { name: string; status: 'passed' | 'failed' | 'running'; detail: string; suggestion?: string }[];
  onRerun: () => void;
}
```

---

## 边界条件

| 场景 | 处理方式 |
|------|---------|
| 后端/数据库不可用 | 健康页面使用缓存数据（最多缓存 5 分钟），显示"上次更新"时间 |
| 供应商通道数量 > 50 | 按健康率排序，默认展示异常/警告通道，可展开查看全部 |
| 诊断检查超时 | 单项检查超时 10 秒 → 标记为 failed + 超时提示 |
| 资源监控数据跨多台服务器 | 当前仅监控单台（生产服 1），多服场景留扩展字段 |
| 健康评分空值 | 首次启动时部分维度无数据 → 跳过该维度，加权剩余维度 |

---

## 验收标准

1. 健康大屏展示所有服务状态（API/数据库/Redis/供应商/磁盘/安全）
2. 6 维度健康评分正确计算并展示加权总分
3. 近 7 天健康评分趋势图正常显示
4. 资源监控显示 CPU/内存/磁盘/进程内存实时数据
5. 一键诊断 6 项检查全部执行并展示结果
6. 供应商通道健康表按健康率排序展示
7. 数据自动刷新（每 30 秒），显示上次更新时间
8. 后端不可用时降级显示缓存数据

---

## 关联模块

| 模块 | 关联方式 |
|------|---------|
| §4.18 健康检查 Drill | 健康检查数据源相同，大屏是面向管理员的汇总视图 |
| §5.4 告警规则 | 健康评分低于阈值可触发告警 |
| §12.7 变更计划 | 变更执行前后对比健康评分变化 |

---

### [?] 页面帮助
**页面名称**：健康检查大屏
**核心操作**：查看系统整体健康状态、各维度评分、资源监控、触发自动诊断
**注意事项**：数据每 30 秒自动刷新；诊断检查可能产生轻微负载，建议按需使用

### [?] 按钮级帮助对照表
| 按钮/操作 | 帮助说明 |
|----------|---------|
| 刷新 | 手动刷新当前所有健康数据 |
| 自动诊断 | 触发 6 项系统诊断检查，检查过程约 10-30 秒 |
| 服务详情 | 点击服务卡片查看单个服务的详细健康数据 |
| 供应商详情 | 查看各供应商通道的实时健康状态 |