# KPI 下钻与系统健康巡检 — 深化参考文档

> **对应章节**：[PRD-README.md §4.1 总览看板](../PRD-README.md#41-总览看板) + [§4.7 监控日志](../PRD-README.md#47-监控与日志精化) — 深化模块
> **状态**：已深化完成 ✅ | **版本**：v2.0 | **最后更新**：2026-07-28
> **定位**：增强管理看板的可交互深度（点击 KPI 下钻到明细），以及自动系统健康巡检体系（Agent 架构 + 调度引擎 + 报告推送）。
> **设计原则**：KPI 下钻复用现有页面路由，不新建独立页面体系。健康巡检采用中心化调度 + 本地 Agent 执行模式。
> **粒度**：下钻规范 → 巡检架构 → Agent 设计 → 报告结构 → API → 组件 → 配置 → 边界 → 验收

---

## 目录

1. [KPI 卡片下钻规范](#1-kpi-卡片下钻规范)
2. [下钻目标页面规范](#2-下钻目标页面规范)
3. [下钻深度与展开](#3-下钻深度与展开)
4. [系统健康巡检架构](#4-系统健康巡检架构)
5. [巡检引擎设计](#5-巡检引擎设计)
6. [巡检 Agent 部署模式](#6-巡检-agent-部署模式)
7. [巡检项目完整清单](#7-巡检项目完整清单)
8. [巡检报告结构](#8-巡检报告结构)
9. [巡检告警与通知](#9-巡检告警与通知)
10. [API 接口规格](#10-api-接口规格)
11. [前端组件 Props](#11-前端组件-props)
12. [运营配置项](#12-运营配置项)
13. [边界条件](#13-边界条件)
14. [验收标准](#14-验收标准)
15. [交叉引用](#15-交叉引用)

---

## 1. KPI 卡片下钻规范

### 1.1 下钻交互定义

```
┌─────────────────────────────────────────────────────┐
│  今日 DAU            日调用量          MRR           │
│  ┌─────────┐        ┌─────────┐      ┌─────────┐   │
│  │  1,234  │        │ 89,456  │      │¥12,345 │   │
│  │ ▲ 12.5% │        │ ▼ 3.2%  │      │ ▲ 5.1% │   │
│  │点击下钻→│        │点击下钻→│      │点击下钻→│   │
│  └─────────┘        └─────────┘      └─────────┘   │
│                                                       │
│  点击 DAU → /admin/users?active=today                 │
│  点击 调用量 → /admin/logs/calls?range=today          │
│  点击 MRR → /admin/finance?view=revenue&period=month │
└───────────────────────────────────────────────────────┘
```

**交互规则**：
- 悬停：指针变手型 + 卡片 scale(1.02) 微放大 + 底部浮现"点击查看详情"
- 点击：根据 config 决定同 Tab 跳转或新 Tab 打开（默认同 Tab）
- 下钻页面中：顶部固定栏显示摘要信息 + 当前筛选条件标签
- 返回：下钻页面提供"返回看板"按钮

### 1.2 下钻映射表

| 管理看板 KPI | 指标 key | 下钻页面 | 携带参数 | 说明 |
|-------------|---------|---------|---------|------|
| 今日 DAU | `dau` | `/admin/users` | `scope=active&date=today` | 今日调用过的用户列表 |
| 日调用量 | `daily_calls` | `/admin/logs/calls` | `range=today` | 今日调用日志 |
| MRR | `mrr` | `/admin/finance/revenue` | `period=this_month` | 本月收入明细 |
| 毛利率 | `gross_margin` | `/admin/finance/cost-analysis` | — | 成本分析页 |
| 7 日留存 | `retention_7d` | `/admin/users` | `view=retention_cohort` | 留存分群详情 |
| 代理活跃度 | `agent_activity` | `/admin/agents` | `active=30d` | 近 30 天活跃代理 |
| Key 使用率 | `key_usage_rate` | `/admin/api-keys` | `scope=used_7d` | 近 7 天有调用的 Key |
| 供应商健康度 | `vendor_health` | `/admin/vendors` | `view=health` | 供应商健康面板 |
| 告警收敛率 | `alert_convergence` | `/admin/alerts` | `type=real` | 真实告警列表 |
| ARPU | `arpu` | `/admin/finance/arpu-analysis` | — | ARPU 分析页 |
| 日营收 | `daily_revenue` | `/admin/finance/revenue` | `range=today` | 今日营收详情 |
| 新增用户 | `new_users` | `/admin/users` | `scope=registered&date=today` | 今日注册用户 |
| 失败率 | `failure_rate` | `/admin/logs/calls` | `status=failed&range=today` | 今日失败调用 |
| 待处理工单 | `open_tickets` | `/admin/tickets` | `view=open` | 工单列表（待接单）|
| 平台余额 | `platform_balance` | `/admin/finance` | `view=balance` | 余额详情 |
| 模型调用分布 | `model_distribution` | `/admin/logs/calls` | `view=distribution&range=today` | 模型调用占比 |

### 1.3 下钻路由配置

下钻映射通过后端配置驱动，运营可按需修改：

```typescript
// site_configs.drilldown_routes
interface DrilldownRouteConfig {
  metric: string;
  label: string;
  targetPath: string;
  params: Record<string, string>;
  openInNewTab: boolean;
  description: string;
}
```

---

## 2. 下钻目标页面规范

### 2.1 成本分析页 `/admin/finance/cost-analysis`

**页面结构**：

```
┌─ 成本分析 ───────────────────────────────────────────┐
│ ◀ 返回看板   筛选: 2026-07                           │
├──────────────────────────────────────────────────────┤
│                                                        │
│ 📊 汇总                                                │
│ 总成本: ¥45,678     平台毛利: ¥123,456    毛利率: 73%  │
│                                                        │
│ 📈 成本趋势（本月每日 vs 上月同期对比）                │
│ ├────────────────────────────────────────────────────┤ │
│ │ [折线图: 蓝色=本月, 灰色=上月]                     │ │
│ └────────────────────────────────────────────────────┘ │
│                                                        │
│ 🥧 供应商成本占比                                       │
│ ├────────────────────────────────────────────────────┤ │
│ │ [饼图: DeepSeek 55%, GLM 25%, 其他 20%]            │ │
│ └────────────────────────────────────────────────────┘ │
│                                                        │
│ 📋 成本效率（成本/调用量 = 单位调用成本）              │
│ ┌──────────┬────────┬────────┬────────┐               │
│ │ 模型     │ 成本   │ 调用量 │ 效率   │               │
│ ├──────────┼────────┼────────┼────────┤               │
│ │ ds-chat  │ ¥36K   │ 500K   │ ¥0.072 │               │
│ │ glm-5    │ ¥25K   │ 200K   │ ¥0.125 │               │
│ │ ...      │ ...    │ ...    │ ...    │               │
│ └──────────┴────────┴────────┴────────┘               │
│                                                        │
│ ⚠️ 成本异常标记                                         │
│ 模型 glm-5-pro: 成本较上月增长 65% (>50% 阈值)         │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### 2.2 ARPU 分析页 `/admin/finance/arpu-analysis`

**页面结构**：

```
┌─ ARPU 分析 ───────────────────────────────────────────┐
│ ◀ 返回看板   周期: 近 6 个月                           │
├────────────────────────────────────────────────────────┤
│                                                          │
│ 📊 整体 ARPU 趋势                                       │
│ ├──────────────────────────────────────────────────────┤ │
│ │ [折线图: 月 ARPU 趋势]                               │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ 当前月 ARPU: ¥89.5   同比变化: ▲ 15.2%   环比: ▲ 3.1%  │
│                                                          │
│ 📊 按用户分层 ARPU 对比                                  │
│ ├──────────────────────────────────────────────────────┤ │
│ │ [柱状图: 种子/活跃/普通/休眠]                        │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ 📊 按代理渠道 ARPU 对比                                  │
│ ├──────────────────────────────────────────────────────┤ │
│ │ [柱状图: 各代理引入用户的 ARPU]                      │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ 📋 ARPU Top 20 用户                                     │
│ ┌────┬────────┬────────┬────────┬────────┐             │
│ │ #  │ 用户   │ 等级   │ 月消费 │ ARPU   │             │
│ ├────┼────────┼────────┼────────┼────────┤             │
│ │ 1  │ user_X │ 5      │¥12,345 │¥12,345 │             │
│ │ ...│ ...    │ ...    │ ...    │ ...    │             │
│ └────┴────────┴────────┴────────┴────────┘             │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## 3. 下钻深度与展开

### 3.1 两级下钻

```
第 1 级: KPI 卡片 → 明细页面
  示例: 今日 DAU 卡片 → /admin/users?active=today
  展示: 活跃用户列表 + 时间分布

第 2 级: 明细页 → 单行详情
  示例: 活跃用户列表中点击某用户 → 用户详情页
  展示: 用户完整信息 + 调用历史

说明: 第 2 级走现有路由体系，KPI 下钻覆盖到第 1 级
```

### 3.2 下钻弹窗模式（可选）

某些场景下运营希望不跳转页面，在当前页叠加下钻内容：

```
看板页面 → 点击 KPI 卡片
  └─ (config 决定) 跳转新页 OR 弹窗下钻
  
弹窗下钻模式:
  └─ 模态弹窗: 展示下钻内容
  └─ 弹窗尺寸: 大型(80vw × 80vh)
  └─ 可滚动、可筛选、可导出
  └─ 关闭弹窗回到看板原始状态
```

---

## 4. 系统健康巡检架构

### 4.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                     调度中心 (API 进程内)               │
│                                                          │
│  HealthCheckScheduler                                    │
│  ├─ cron 驱动: 按配置频率执行检查                        │
│  ├─ 管理注册的检查项                                     │
│  ├─ 聚合结果、更新健康状态                               │
│  ├─ 触发告警通知                                         │
│  └─ 生成巡检报告                                         │
└──────────────────────┬────────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
    ┌─────────┐  ┌─────────┐  ┌─────────┐
    │本地检查  │  │远程检查  │  │供应商    │
    │(API进程) │  │(SSH/HTTP)│  │连通性    │
    └─────────┘  └─────────┘  └─────────┘
```

### 4.2 架构决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 中心化 vs 分布式 | 中心化调度 | 统一管理、报告聚合、配置简单 |
| 机房内 Agent | 不需要 | 云服务商提供监控工具（华为云 CES）|
| 巡检执行者 | API 进程内 | 健康检查检查自身，外部依赖用 HTTP/SSH |
| 数据存储 | PostgreSQL | 复用现有数据库，巡检数据量小 |

---

## 5. 巡检引擎设计

### 5.1 引擎核心

```typescript
// 检查项注册接口
interface HealthCheckItem {
  type: string;                    // 唯一标识
  label: string;                   // 人类可读名称
  category: string;                // service | database | system | vendor | cert | backup | queue
  severity: "critical" | "warning" | "info";
  interval: number;                // 检查间隔(秒)
  timeout: number;                 // 单次检查超时(ms)
  enabled: boolean;                // 是否启用
  run: () => Promise<HealthCheckResult>;
}

interface HealthCheckResult {
  status: "pass" | "warning" | "fail";
  message: string;
  metrics?: Record<string, any>;
  duration: number;                // 执行耗时(ms)
}
```

### 5.2 执行流程

```
HealthCheckScheduler.run()
    │
    ├─ Step 1: 加载注册的检查项列表
    │
    ├─ Step 2: 过滤出到期的检查项（上次执行时间 + interval <= now）
    │
    ├─ Step 3: 并行执行到期检查项（Promise.allSettled）
    │   ├─ 每个检查项有自己的 timeout
    │   ├─ 超时的检查项记为 status=fail, message="timeout"
    │   └─ 捕获异常不中断其他检查
    │
    ├─ Step 4: 写入 health_checks 表
    │
    ├─ Step 5: 更新内存中的健康状态缓存
    │
    ├─ Step 6: 判定告警
    │   ├─ fail → 立即告警
    │   ├─ warning → 持续 3 次 → 告警
    │   └─ pass → 清除关联告警
    │
    └─ Step 7: 计算总体健康评分
        └─ score = 100 - failCount * 10 - warningCount * 2
```

### 5.3 检查项注册表

```
检查项通过 modules/healthcheck/checks/*.ts 文件注册
  文件示例:
    ├─ api-service.ts       — API 健康检查
    ├─ database.ts          — 数据库连接
    ├─ redis.ts             — Redis 连接
    ├─ disk.ts              — 磁盘空间
    ├─ memory.ts            — 内存使用
    ├─ cpu.ts               — CPU 使用率
    ├─ vendor-connectivity  — 供应商连通性
    ├─ ssl-cert.ts          — SSL 证书
    ├─ backup.ts            — 备份完整性
    ├─ migration.ts         — 迁移状态
    ├─ queue-backlog.ts     — 队列积压
    └─ error-rate.ts        — API 错误率

注册方式:
  └─ healthCheckRegistry.register(apiServiceCheck);
  └─ healthCheckRegistry.register(databaseCheck);
  └─ ...
```

### 5.4 具体检查项实现示例

**API 服务检查**：

```typescript
const apiServiceCheck: HealthCheckItem = {
  type: "api_service",
  label: "API 服务响应",
  category: "service",
  severity: "critical",
  interval: 60,
  timeout: 5000,
  enabled: true,

  async run(): Promise<HealthCheckResult> {
    const start = Date.now();
    const res = await fetch(`http://localhost:${config.port}/health`);

    if (res.status !== 200) {
      return { status: "fail", message: `Health check returned ${res.status}`, duration: Date.now() - start };
    }

    const data = await res.json();
    if (data.status !== "ok") {
      return { status: "fail", message: "Service unhealthy", metrics: data, duration: Date.now() - start };
    }

    return { status: "pass", message: "Service healthy", metrics: data, duration: Date.now() - start };
  },
};
```

**磁盘检查**：

```typescript
const diskCheck: HealthCheckItem = {
  type: "disk_usage",
  label: "磁盘空间",
  category: "system",
  severity: "warning",
  interval: 3600,            // 每小时
  timeout: 10000,
  enabled: true,

  async run(): Promise<HealthCheckResult> {
    const { exec } = require("child_process");
    const stdout = await execAsync("df -h / | tail -1");
    // "Filesystem  Size  Used Avail Use% Mounted"
    const parts = stdout.trim().split(/\s+/);
    const usagePercent = parseInt(parts[4].replace("%", ""));

    if (usagePercent >= 95) {
      return { status: "fail", message: `磁盘使用率 ${usagePercent}%`, metrics: { usagePercent } };
    }
    if (usagePercent >= 85) {
      return { status: "warning", message: `磁盘使用率 ${usagePercent}%`, metrics: { usagePercent } };
    }
    return { status: "pass", message: `磁盘使用率 ${usagePercent}%`, metrics: { usagePercent } };
  },
};
```

**供应商连通性检查**：

```typescript
const vendorConnectivityCheck: HealthCheckItem = {
  type: "vendor_connectivity",
  label: "供应商连通性",
  category: "vendor",
  severity: "warning",
  interval: 300,            // 5分钟
  timeout: 15000,
  enabled: true,

  async run(): Promise<HealthCheckResult> {
    const vendors = await db.select().from(vendors).where(eq(vendors.isEnabled, true));
    const results = await Promise.allSettled(
      vendors.map(v => this.checkVendor(v))
    );

    const failures = results.filter(r => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok));
    const slowOnes = results.filter(r => r.status === "fulfilled" && r.value.latency > 5000);

    if (failures.length > 0) {
      return {
        status: "fail",
        message: `${failures.length}/${vendors.length} 供应商不可达`,
        metrics: { total: vendors.length, failures: failures.length, slow: slowOnes.length },
      };
    }
    if (slowOnes.length > 0) {
      return {
        status: "warning",
        message: `${slowOnes.length}/${vendors.length} 供应商延迟 > 5s`,
        metrics: { total: vendors.length, failures: 0, slow: slowOnes.length },
      };
    }
    return { status: "pass", message: "所有供应商连通", metrics: { total: vendors.length } };
  },
};
```

---

## 6. 巡检 Agent 部署模式

### 6.1 单机部署（默认，适用于 3cloud 当前架构）

```
巡检全部在 API 进程内执行:
  └─ 内建检查项直接查询进程状态
  └─ 磁盘/CPU/内存通过 os 模块或 exec 命令获取
  └─ 数据库/Redis 通过现有连接池探活
  └─ 供应商通过 HTTP HEAD 到测试端点

优点: 零额外部署成本
限制: 无法巡检集群其他节点
```

### 6.2 多节点部署（未来扩展）

```
┌─ 调度中心 (API 进程)
│  ├─ 聚合各节点上报的健康数据
│  └─ 在监控看板展示集群健康全景

┌─ Node 1 (API 主进程)
│  └─ 运行本地检查项 + 上报

┌─ Node 2 (API 从进程)
│  └─ 运行本地检查项 + 上报

┌─ 数据库节点 (可选)
│  └─ Agent 独立部署 + 上报
```

### 6.3 数据上报协议（多节点场景）

```
HTTP POST /api/v1/admin/system-health/report
  Body:
    nodeId: string;
    checkType: string;
    status: "pass" | "warning" | "fail";
    message: string;
    metrics: Record<string, any>;
    reportedAt: string;
```

---

## 7. 巡检项目完整清单

### 7.1 全部检查项定义

| # | 检查项 | type | 分类 | 严重级 | 频率 | 超时(ms) | 判定标准 |
|---|-------|------|------|--------|------|---------|---------|
| 1 | API 服务响应 | `api_service` | service | critical | 60s | 5000 | /health 返回 200 |
| 2 | 数据库连接 | `database_connection` | database | critical | 60s | 5000 | SELECT 1 成功 < 500ms |
| 3 | 数据库连接池 | `database_pool` | database | warning | 300s | 3000 | 活跃连接 < poolSize × 80% |
| 4 | Redis 连接 | `redis_connection` | database | warning | 60s | 2000 | PING 成功 |
| 5 | Redis 内存 | `redis_memory` | database | warning | 300s | 3000 | 使用率 < 80% |
| 6 | 磁盘使用率 | `disk_usage` | system | warning | 1h | 10000 | 各挂载点使用率 < 85% |
| 7 | 内存使用率 | `memory_usage` | system | warning | 1h | 10000 | 使用率 < 90% |
| 8 | CPU 使用率 | `cpu_usage` | system | warning | 1h | 10000 | 5min 负载 < 80% |
| 9 | 供应商连通性 | `vendor_connectivity` | vendor | warning | 5min | 15000 | 测试端点延迟 < 5s |
| 10 | SSL 证书 | `ssl_certificate` | vendor | warning | 24h | 10000 | 剩余天数 > 30 |
| 11 | 备份完整性 | `backup_integrity` | backup | critical | 24h | 30000 | 最近备份 < 24h 且校验通过 |
| 12 | 数据库迁移 | `database_migration` | database | critical | 每次部署 | 30000 | 迁移全部通过 |
| 13 | 队列积压 | `queue_backlog` | queue | warning | 10min | 5000 | 队列长度 < 1000 |
| 14 | API 错误率 | `api_error_rate` | service | warning | 5min | 10000 | 近 5min 错误率 < 2% |
| 15 | 响应时间 P99 | `response_time_p99` | service | warning | 5min | 10000 | P99 < 5000ms |

### 7.2 异常分级

| 等级 | 颜色 | 说明 | 告警方式 |
|------|------|------|---------|
| 🔴 critical | 红色 | 核心服务不可用/数据有损 | 立即告警（短信/企业微信/邮件） |
| 🟡 warning | 黄色 | 资源接近上限/非核心异常 | 累计 3 次后告警（站内信/邮件） |
| 🟢 pass | 绿色 | 正常 | 不告警 |

---

## 8. 巡检报告结构

### 8.1 报告 Schema

```typescript
interface HealthCheckReport {
  id: number;
  generatedAt: string;
  period: {
    start: string;
    end: string;
  };

  // 总体评分
  overallScore: number;          // 0-100
  overallStatus: "healthy" | "degraded" | "critical";

  // 汇总
  summary: {
    total: number;                // 总检查项数
    pass: number;
    warning: number;
    fail: number;
    skipped: number;
  };

  // 按分类汇总
  byCategory: {
    category: string;
    label: string;
    pass: number;
    warning: number;
    fail: number;
    total: number;
    score: number;                // 分类得分
  }[];

  // 详细检查结果
  details: {
    checkType: string;
    label: string;
    category: string;
    severity: string;
    status: "pass" | "warning" | "fail";
    message: string;
    metrics: Record<string, any>;
    duration: number;
    checkedAt: string;
    previousStatus?: string;
    trend?: "stable" | "improving" | "degrading";
  }[];

  // 异常项（仅 fail 和 warning）
  anomalies: {
    checkType: string;
    label: string;
    severity: string;
    status: "warning" | "fail";
    message: string;
    suggestedAction: string;      // 建议操作
    firstObservedAt?: string;     // 首次异常时间
    duration?: number;            // 持续时长(ms)
  }[];

  // 趋势对比
  comparison: {
    vsLastCheck: {
      scoreChange: number;
      changeLabel: "improved" | "degraded" | "stable";
    };
    vsYesterday: {
      scoreChange: number;
      changeLabel: string;
    };
  };

  // 资源趋势
  resourceTrends: {
    cpu: TrendPoint[];
    memory: TrendPoint[];
    disk: TrendPoint[];
  };
}

interface TrendPoint {
  timestamp: string;
  value: number;
}
```

### 8.2 报告生成逻辑

```
每日 09:00 自动生成完整报告
  └─ 获取最近 24h 内的所有检查结果
  └─ 聚合计算各分类得分
  └─ 对比前一日/前一周评分
  └─ 生成资源趋势（7 天 CPU/内存/磁盘）
  └─ 写入 health_check_reports 表（或 PDF 存储）

手动触发:
  └─ 管理员在巡检看板点击"生成报告"
  └─ 立即执行一次全面巡检
  └─ 生成 PDF 并提供下载
```

### 8.3 报告存储

```typescript
export const healthCheckReports = pgTable("health_check_reports", {
  id: serial("id").primaryKey(),
  period: daterange("period").notNull(),               // 报告周期
  overallScore: integer("overall_score").notNull(),     // 0-100
  overallStatus: varchar("overall_status", { length: 16 }).notNull(),
  reportData: jsonb("report_data").notNull(),           // 完整报告数据
  pdfUrl: varchar("pdf_url", { length: 1024 }),         // PDF 文件 URL
  generatedBy: integer("generated_by"),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

---

## 9. 巡检告警与通知

### 9.1 告警规则

```
┌─ 具体告警规则（对接 ref-5.4-alert-rules.md）────────┐
│                                                        │
│ 检查项触发 fail：
│  └─ critical 级别 → 立即发送告警（短信/企微/邮件）
│  └─ warning 级别 → 持续 3 次连续 → 发送告警
│  └─ warning 级别 → 单次 → 仅记录，不告警
│                                                        │
│ 检查项恢复：
│  └─ 连续 2 次 pass → 自动清除关联告警
│  └─ 发送恢复通知（站内信）
│                                                        │
│ 告警收敛：
│  └─ 同检查项 30 分钟内不重复告警
│  └─ 合并同类告警："3 项检查未通过"
│                                                        │
└────────────────────────────────────────────────────────┘
```

### 9.2 通知方式

| 异常等级 | 通知方式 | 目标角色 |
|---------|---------|---------|
| critical (fail) | 短信 + 企微 + 邮件 | super_admin, ops |
| warning (连续 3 次) | 站内信 + 邮件 | ops |
| warning (单次) | 记录不通知 | — |
| 恢复 | 站内信 | 原通知人 |

---

## 10. API 接口规格

### 10.1 KPI 下钻

| 方法 | 路径 | 说明 | 权限 | 缓存 |
|------|------|------|------|------|
| GET | `/api/v1/admin/kpi/drill/:metric` | 获取指标下钻数据 | DASHBOARD_VIEW | TTL 60s |
| GET | `/api/v1/admin/kpi/drill-route/:metric` | 获取下钻路由配置 | DASHBOARD_VIEW | TTL 300s |

**GET drill/:metric 响应**：

```typescript
interface KpiDrillResponse {
  metric: string;
  label: string;
  summary: {
    value: number;
    change: string;
    trend: "up" | "down" | "stable";
  };
  detailUrl: string;                              // 路由跳转 URL
  detailData?: any;                               // 弹窗模式下直接返回数据
  drillConfig: {
    openInNewTab: boolean;
    hasPopupMode: boolean;
  };
}
```

### 10.2 健康巡检

| 方法 | 路径 | 说明 | 权限 | 缓存 |
|------|------|------|------|------|
| GET | `/api/v1/admin/system-health` | 当前健康状态 | DASHBOARD_VIEW | TTL 30s |
| GET | `/api/v1/admin/system-health/:checkType` | 单项检查详情 | DASHBOARD_VIEW | TTL 60s |
| POST | `/api/v1/admin/system-health/check` | 手动触发巡检 | OPS_EDIT | — |
| POST | `/api/v1/admin/system-health/check/:checkType` | 手动触发单项检查 | OPS_EDIT | — |
| GET | `/api/v1/admin/system-health/history` | 巡检历史 | DASHBOARD_VIEW | — |
| GET | `/api/v1/admin/system-health/checks` | 检查项配置列表 | OPS_VIEW | TTL 300s |
| PATCH | `/api/v1/admin/system-health/checks/:checkType` | 更新检查项配置 | OPS_EDIT | — |
| GET | `/api/v1/admin/system-health/reports` | 报告列表 | DASHBOARD_VIEW | TTL 300s |
| GET | `/api/v1/admin/system-health/reports/:id` | 报告详情 | DASHBOARD_VIEW | TTL 300s |
| GET | `/api/v1/admin/system-health/reports/:id/download` | 下载 PDF | DASHBOARD_VIEW | — |
| POST | `/api/v1/admin/system-health/checks/:checkType/test` | 测试执行单项 | OPS_EDIT | — |

**GET /system-health 响应**：

```typescript
interface SystemHealthResponse {
  status: "healthy" | "degraded" | "critical";
  score: number;
  lastCheckedAt: string;
  summary: {
    total: number;
    pass: number;
    warning: number;
    fail: number;
  };
  byCategory: {
    category: string;
    label: string;
    status: "pass" | "warning" | "fail";
    score: number;
    checks: { type: string; label: string; status: string; message: string }[];
  }[];
  recentAnomalies: {
    checkType: string;
    label: string;
    status: string;
    message: string;
    firstObservedAt: string;
  }[];
}
```

### 10.3 成本分析与 ARPU

| 方法 | 路径 | 说明 | 权限 | 缓存 |
|------|------|------|------|------|
| GET | `/api/v1/admin/finance/cost-analysis` | 成本分析数据 | FINANCE_VIEW | TTL 300s |
| GET | `/api/v1/admin/finance/arpu-analysis` | ARPU 分析数据 | FINANCE_VIEW | TTL 300s |

---

## 11. 前端组件 Props

### 11.1 DrillableKpiCard — 可下钻 KPI 卡片

```typescript
interface DrillableKpiCardProps {
  metric: string;                    // 唯一标识
  title: string;                     // 展示标题
  value: number | string;            // KPI 值
  valueFormat?: "number" | "currency" | "percent";
  change?: string;                   // 变化率 "+12.5%"
  changeDirection?: "up" | "down" | "stable";
  detailUrl?: string;                // 下钻 URL
  openInNewTab?: boolean;
  size?: "sm" | "md" | "lg";        // 尺寸
  loading?: boolean;
  onClick?: () => void;              // 自定义点击行为（覆盖默认跳转）
}

// 使用示例
<DrillableKpiCard
  metric="dau"
  title="今日 DAU"
  value={1234}
  change="+12.5%"
  changeDirection="up"
  detailUrl="/admin/users?active=today"
/>
```

### 11.2 DrillPopup — 弹窗下钻

```typescript
interface DrillPopupProps {
  visible: boolean;
  metric: string;
  title: string;
  onClose: () => void;
  width?: string;
  height?: string;
}

// 内部通过 API /kpi/drill/:metric 获取数据并渲染
```

### 11.3 SystemHealthDashboard — 健康巡检看板

```typescript
interface SystemHealthDashboardProps {
  autoRefresh?: boolean;              // 自动刷新
  refreshIntervalMs?: number;         // 默认 60000
}

interface HealthStatusCardProps {
  category: string;
  label: string;
  status: "pass" | "warning" | "fail";
  score: number;
  items: HealthCheckSummaryItem[];
  onViewDetails: (checkType: string) => void;
}

interface HealthCheckSummaryItem {
  type: string;
  label: string;
  status: "pass" | "warning" | "fail";
  message: string;
  duration: number;
  severity: string;
}
```

### 11.4 HealthCheckDetail — 单项检查详情

```typescript
interface HealthCheckDetailProps {
  checkType: string;
  data: HealthCheckHistoryItem[];
}

interface HealthCheckHistoryItem {
  status: string;
  message: string;
  metrics: Record<string, any>;
  duration: number;
  checkedAt: string;
}
```

### 11.5 HealthReportViewer — 巡检报告查看

```typescript
interface HealthReportViewerProps {
  reportId?: number;                  // 不传则显示最新报告
}

interface HealthReportSummaryCardProps {
  overallScore: number;
  overallStatus: string;
  passCount: number;
  warningCount: number;
  failCount: number;
  period: string;
  comparison: string;                 // "较昨日 +2 分"
}

interface HealthReportDetailSectionProps {
  category: string;
  label: string;
  score: number;
  items: HealthCheckResultItem[];
}

interface HealthCheckResultItem {
  label: string;
  status: string;
  message: string;
  previousStatus?: string;
  trend?: "stable" | "improving" | "degrading";
}
```

### 11.6 ResourceTrendChart — 资源趋势图

```typescript
interface ResourceTrendChartProps {
  resource: "cpu" | "memory" | "disk";
  data: { timestamp: string; value: number }[];
  threshold?: number;                 // 告警阈值线
}

// 实际使用 Recharts AreaChart
```

### 11.7 CostAnalysisPage / ArpuAnalysisPage — 分析页面

```typescript
interface CostAnalysisPageProps {
  period?: string;                    // 默认本月
}

interface ArpuAnalysisPageProps {
  period?: string;                    // 默认最近 6 个月
}

// 均为路由页面组件
```

---

## 12. 运营配置项

### 12.1 下钻配置

| 配置项 | 路径 | 类型 | 默认值 | 说明 |
|-------|------|------|--------|------|
| 下钻跳转模式 | `site_configs.drilldown.open_in_new_tab` | boolean | false | true=新Tab, false=同Tab |
| 弹窗下钻启用 | `site_configs.drilldown.popup_mode_enabled` | boolean | false | 是否启用弹窗下钻 |
| 弹窗下钻白名单 | `site_configs.drilldown.popup_whitelist` | json | `[]` | 可弹窗下钻的指标列表 |

### 12.2 健康巡检配置

| 配置项 | 路径 | 类型 | 默认值 | 说明 |
|-------|------|------|--------|------|
| 巡检启用 | `site_configs.healthcheck.enabled` | boolean | true | 全局开关 |
| 自动报告时间 | `site_configs.healthcheck.report_cron` | string | `0 9 * * *` | 每日生成报告 cron |
| 告警抑制窗口 | `site_configs.healthcheck.alert_cooldown_minutes` | int | 30 | 同类告警间隔(分钟) |
| 健康评分权重 | `site_configs.healthcheck.weight_critical` | int | 10 | critical fail 扣分 |
| 健康评分权重 | `site_configs.healthcheck.weight_warning` | int | 2 | warning 扣分 |
| 检查项默认超时 | `site_configs.healthcheck.default_timeout_ms` | int | 5000 | 全局超时 |
| 数据保留天数 | `site_configs.healthcheck.retention_days` | int | 90 | health_checks 记录保留 |

### 12.3 检查项级别覆盖

每个检查项支持在 `site_configs.healthcheck.overrides` 中单独覆盖：

```json
{
  "disk_usage": {
    "enabled": true,
    "interval": 1800,
    "threshold_warning": 80,
    "threshold_critical": 90
  },
  "ssl_certificate": {
    "enabled": true,
    "interval": 43200,
    "warning_days": 60
  }
}
```

---

## 13. 边界条件

### 13.1 下钻边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B1 | KPI 指标无对应下钻页面 | 卡片不展示下钻交互（不可点击）|
| B2 | 下钻 URL 未配置 | 返回空 detailUrl，前端不做跳转 |
| B3 | 下钻数据量大（如 DAU 关联 10 万用户）| 接口只返回摘要 + TOP N，完整列表由目标页面分页 |
| B4 | 用户无下钻目标页面权限 | 跳转后页面显示 403，不影响看板 |

### 13.2 巡检边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B5 | 检查项超时 | 记为 fail 并记录 timeout，不阻塞其他检查 |
| B6 | 巡检引擎自身崩溃 | 下次进程启动时自检，手动触发可恢复 |
| B7 | 磁盘/网络权限不足无法执行检查 | 记为 skipped 并记录原因，不触发告警 |
| B8 | 数据库中 health_checks 表过大 | 自动 TTL 清理（保留 90 天），定期归档 |
| B9 | 多个 API 进程同时执行巡检 | 分布式锁（Redis SETNX）避免重复 |
| B10 | 供应商全部不可达（网络故障）| 记录供应商故障事件，不重复触发整单告警 |

### 13.3 报告边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B11 | 报告生成时无数据 | 返回空报告，标记为 "insufficient data" |
| B12 | PDF 生成失败 | 报告保留 JSON 格式，PDF 字段留空 |
| B13 | 报告对比时昨日数据不存在 | 跳过对比，标记 "no previous data" |

### 13.4 并发边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B14 | 多个管理员同时触发手动巡检 | 分布式锁，5 分钟内仅执行一次 |
| B15 | 自动巡检与手动巡检冲突 | 手动巡检跳过正在执行的检查项 |

---

## 14. 验收标准

### 14.1 KPI 下钻

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC1 | 下钻交互 | 悬停/点击行为正确，跳转 URL 携带筛选参数 |
| AC2 | 弹窗下钻 | 弹窗展示下钻内容，关闭后恢复看板 |
| AC3 | 缺省处理 | 无下钻配置的 KPI 不可点击 |
| AC4 | 权限校验 | 无权限用户跳转后显示 403 |

### 14.2 健康巡检

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC5 | 自动巡检 | cron 按配置频率执行，检查结果正确写入 |
| AC6 | 手动巡检 | 触发后立即执行全量检查，结果展示在页面 |
| AC7 | 单项检查 | 单项触发/测试执行正常 |
| AC8 | 检查项配置 | 启用/禁用/调整频率后生效 |
| AC9 | 告警触发 | fail 立即告警，warning 持续 3 次告警 |
| AC10 | 告警恢复 | 连续 2 次 pass 自动清除告警 |
| AC11 | 告警收敛 | 同检查项 30 分钟内不重复发送 |
| AC12 | 权限控制 | 查看/操作权限正确分离 |

### 14.3 巡检报告

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC13 | 自动生成 | 每日 09:00 生成报告，评分正确 |
| AC14 | 手动下载 PDF | PDF 格式正确，包含所有章节 |
| AC15 | 趋势对比 | 与昨日/上周评分对比正确 |
| AC16 | 资源趋势图 | 7 天 CPU/内存/磁盘趋势正确 |

### 14.4 成本分析 & ARPU

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC17 | 成本分析 | 供应商占比/模型效率/异常标记正确 |
| AC18 | ARPU 分析 | 分层/渠道对比趋势正确 |

---

## 15. 交叉引用

| 关联模块 | 文档 | 关系 |
|---------|------|------|
| 管理看板 | `ref-4.1-admin-dashboard.md` | KPI 卡片集成下钻交互 |
| 监控日志 | `ref-4.7-monitor-logs.md` | 下钻目标页面 + 巡检数据源 |
| 告警规则 | `ref-5.4-alert-rules.md` | 巡检异常触发告警 |
| 系统配置 | `ref-4.8-system-config.md` | 巡检阈值/检查项配置存储 |
| 报告推送 | `ref-4.14-report-push.md` | 巡检报告定时推送 |
| 通知规则 | `ref-4.14.5-notification-rules.md` | 巡检告警通知通道 |
| 操作日志 | `ref-4.13-operation-timeline.md` | 巡检/下钻操作记录 |
| 财务分析 | `ref-4.4-finance.md` | 成本分析 + ARPU 数据源 |
