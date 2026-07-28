# 压测方案设计 — 设计文档

> **对应章节**：PRD-README.md §5.7 长期能力 — 压测方案
> **状态**：完整设计 ✅ | **版本**：v1.0 | **最后更新**：2026-07-28
> **定位**：建立系统化的压测方案，覆盖核心链路、API 网关、路由系统、计费引擎、数据库等关键模块，制定明确的性能基准和容量规划。
> **设计原则**：压测不是一次性任务，而是持续的质量保障活动。每次大版本发布前执行压测，建立性能基线。
> **粒度**：压测场景 → 施压方案 → 监控指标 → 性能基线 → 容量规划 → 压测工具 → 压测报告 → 配置 → 边界 → 验收

---

## 目录

1. [压测目标](#1-压测目标)
2. [压测场景定义](#2-压测场景定义)
3. [施压方案](#3-施压方案)
4. [监控指标](#4-监控指标)
5. [性能基线](#5-性能基线)
6. [容量规划模型](#6-容量规划模型)
7. [压测工具选型](#7-压测工具选型)
8. [压测执行流程](#8-压测执行流程)
9. [压测报告结构](#9-压测报告结构)
10. [运营配置项](#10-运营配置项)
11. [边界条件与假设](#11-边界条件与假设)
12. [验收标准](#12-验收标准)
13. [交叉引用](#13-交叉引用)

---

## 1. 压测目标

### 1.1 核心目标

| # | 目标 | 说明 |
|---|------|------|
| 1 | 确定系统最大吞吐量 | 在可接受的延迟范围内，能处理的最大并发请求 |
| 2 | 识别瓶颈点 | CPU、内存、数据库、Redis、网络等瓶颈 |
| 3 | 验证限流/熔断机制 | 超载时系统行为是否符合预期 |
| 4 | 建立性能基线 | 每次大版本发布前对比，确保性能不退化 |
| 5 | 容量规划依据 | 为生产环境扩容提供数据支撑 |

### 1.2 非目标

- 不需要 100% 模拟生产流量（测试环境模拟即可）
- 不需要压测第三方供应商 API（只测到转发层）
- 不需要压测前端页面（只测 API 后端）

---

## 2. 压测场景定义

### 2.1 场景分类

| 场景 | 代码 | 说明 | 对应端点 |
|------|------|------|---------|
| 用户 API 调用 | `api_call` | 模拟用户调用模型 API | `/api/v1/chat/completions` |
| 用户列表查询 | `user_list` | 模拟管理后台用户查询 | `GET /api/v1/admin/users` |
| 财务查询 | `finance_query` | 模拟财务数据查询 | `GET /api/v1/admin/finance/revenue` |
| 批量操作 | `batch_ops` | 模拟批量禁用/启用用户 | `POST /api/v1/admin/users/batch-toggle` |
| 登录认证 | `auth` | 模拟用户登录 | `POST /api/v1/auth/login` |
| 路由决策 | `routing` | 模拟路由选择 | API 调用内部路由逻辑 |
| 混合场景 | `mixed` | 模拟真实流量混合 | 多场景按照比例并发 |

### 2.2 场景详细定义

**场景 1: 用户 API 调用 (api_call)**

```
描述: 模拟大量用户同时调用模型 API
URL: POST /api/v1/chat/completions
请求体: {"model": "deepseek-chat", "messages": [{"role": "user", "content": "test"}], "stream": false}
压力: 50 → 100 → 200 → 500 并发
持续时间: 每个并发级别 5 分钟
预期: P99 < 3000ms, 错误率 < 1%
```

**场景 2: 用户列表查询 (user_list)**

```
描述: 模拟管理后台分页查询用户
URL: GET /api/v1/admin/users?page=1&pageSize=20&status=active
压力: 20 → 50 → 100 并发
持续时间: 每个并发级别 3 分钟
预期: P99 < 1000ms, 错误率 < 0.5%
```

**场景 3: 财务查询 (finance_query)**

```
描述: 模拟查询收入数据（含聚合计算）
URL: GET /api/v1/admin/finance/revenue?period=this_month
压力: 10 → 30 → 50 并发
持续时间: 每个并发级别 3 分钟
预期: P99 < 2000ms, 错误率 < 0.5%
```

**场景 4: 批量操作 (batch_ops)**

```
描述: 模拟批量禁用用户（写操作）
URL: POST /api/v1/admin/users/batch-toggle
请求体: {"userIds": [1,2,3,4,5], "action": "disable"}
压力: 5 → 10 → 20 并发
持续时间: 每个并发级别 3 分钟
预期: P99 < 5000ms, 错误率 < 1%
```

**场景 5: 混合场景 (mixed)**

```
描述: 模拟真实流量混合（按比例并发）
┌────────────────────┬──────────────┐
│ 子场景           │ 比例         │
├────────────────────┼──────────────┤
│ api_call          │ 60%          │
│ user_list         │ 15%          │
│ finance_query     │ 10%          │
│ auth              │ 10%          │
│ batch_ops         │ 5%           │
└────────────────────┴──────────────┘
压力: 逐步增加至总并发 300
持续时间: 30 分钟
预期: 各项指标在容忍范围内，系统稳定
```

### 2.3 压力模型

```
压力递增策略:
  阶段 1: 预热 (30s) — 低并发，让系统 JIT 预热
  阶段 2: 阶梯递增 — 每 3-5 分钟增加一级并发
  阶段 3: 峰值维持 — 最大并发维持 5 分钟
  阶段 4: 回退 — 逐步降低并发，观察恢复

并发模型:
  ┌─ 线性递增: 10 → 20 → 50 → 100 → 200 → 500
  └─ 突发峰值: 维持 100 并发，突然增加到 500（模拟突发流量）
```

---

## 3. 施压方案

### 3.1 本地压测（开发环境）

```
环境: 本地开发机 (Windows 10)
  API: localhost:3000
  PostgreSQL: localhost:5432
  Redis: localhost:6379

工具: autocannon (Node.js)
命令示例:
  npx autocannon -c 50 -d 300 http://localhost:3000/api/v1/admin/users?page=1&pageSize=20

限制: 本地环境硬盘 I/O 和网络带宽有限，适合小规模压测
```

### 3.2 测试环境压测

```
环境: 生产服规格的测试环境（或直接压生产服绕过的路由）
  建议: 使用生产服的备用服务器作为压测目标
  工具: k6 (开源, JS 脚本化)

k6 脚本示例:
  import http from 'k6/http';
  import { check, sleep } from 'k6';

  export const options = {
    stages: [
      { duration: '1m', target: 50 },   // 预热
      { duration: '3m', target: 100 },   // 递增
      { duration: '5m', target: 200 },   // 峰值
      { duration: '2m', target: 0 },     // 回退
    ],
    thresholds: {
      http_req_duration: ['p(99)<3000', 'p(95)<2000'],
      http_req_failed: ['rate<0.01'],
    },
  };

  export default function () {
    const res = http.get('http://localhost:3000/api/v1/admin/users?page=1&pageSize=20', {
      headers: { 'Authorization': 'Bearer test_token' },
    });
    check(res, { 'status is 200': (r) => r.status === 200 });
    sleep(1);
  }
```

### 3.3 生产环境压测（只读场景）

```
安全原则:
  └─ 只压 GET/只读端点
  └─ 避开高峰期 (建议 03:00-06:00)
  └─ 使用独立的 API Key
  └─ 设置全局限流保护

压测端点:
  └─ GET /api/v1/admin/users (用户列表)
  └─ GET /api/v1/admin/finance/revenue (财务查询)
  └─ GET /api/v1/admin/vendors (供应商列表)
  └─ GET /api/v1/admin/logs (日志查询)

禁止压测:
  └─ POST/PATCH/DELETE 端点
  └─ /api/v1/chat/completions 模型调用
  └─ 数据库写操作路径
```

---

## 4. 监控指标

### 4.1 基础指标

| 指标 | 说明 | 采集方式 | 优秀 | 良好 | 警戒 |
|------|------|---------|------|------|------|
| P50 延迟 | 50% 请求的响应时间 | 应用日志 | < 500ms | < 1000ms | > 2000ms |
| P95 延迟 | 95% 请求的响应时间 | 应用日志 | < 1500ms | < 3000ms | > 5000ms |
| P99 延迟 | 99% 请求的响应时间 | 应用日志 | < 3000ms | < 5000ms | > 8000ms |
| 吞吐量 (RPS) | 每秒请求数 | 应用日志 | — | — | 目标值 |
| 错误率 | 非 2xx 响应比例 | 应用日志 | < 0.5% | < 1% | > 2% |
| 超时率 | 连接超时比例 | 应用日志 | 0% | < 0.1% | > 0.5% |

### 4.2 系统资源指标

| 指标 | 采集方式 | 优秀 | 良好 | 警戒 |
|------|---------|------|------|------|
| CPU 使用率 | `top` / `os.cpus()` | < 60% | < 80% | > 90% |
| 内存使用率 | `free` / `process.memoryUsage()` | < 70% | < 85% | > 95% |
| 磁盘 I/O | `iostat` | < 50% | < 70% | > 90% |
| 网络带宽 | `nload` | < 50% | < 70% | > 90% |
| 进程句柄数 | `lsof` | < 1000 | < 3000 | > 5000 |

### 4.3 数据库指标

| 指标 | 采集方式 | 优秀 | 良好 | 警戒 |
|------|---------|------|------|------|
| 活跃连接数 | `SELECT count(*)` | < 10 | < 30 | > 50 |
| 查询延迟 P99 | `pg_stat_activity` | < 50ms | < 100ms | > 500ms |
| 慢查询 (慢于 1s) | `pg_stat_statements` | 0 | < 5/min | > 10/min |
| 锁等待数 | `pg_locks` | 0 | < 3 | > 10 |
| 事务回滚率 | `pg_stat_database` | < 0.1% | < 0.5% | > 1% |

### 4.4 Redis 指标

| 指标 | 采集方式 | 优秀 | 良好 | 警戒 |
|------|---------|------|------|------|
| 命中率 | `INFO stats` | > 95% | > 90% | < 80% |
| 内存使用率 | `INFO memory` | < 60% | < 80% | > 90% |
| 命令延迟 | `INFO commandstats` | < 1ms | < 5ms | > 10ms |
| 连接数 | `INFO clients` | < 50 | < 100 | > 200 |

---

## 5. 性能基线

### 5.1 基线定义

```typescript
interface PerformanceBaseline {
  version: string;                    // 应用版本
  testDate: string;                   // 测试日期
  environment: string;                // 测试环境描述
  scenarios: {
    name: string;
    concurrency: number;
    metrics: {
      p50: number;                    // ms
      p95: number;                    // ms
      p99: number;                    // ms
      throughput: number;             // RPS
      errorRate: number;              // %
      cpuUsage: number;              // %
      memoryUsage: number;           // %
      dbConnections: number;
      redisHitRate: number;
    };
    threshold: {                      // 基线阈值
      p99: number;                    // 最大容忍 P99
      errorRate: number;              // 最大容忍错误率
    };
  }[];
  bottlenecks: {                      // 发现的瓶颈
    type: string;
    description: string;
    severity: "low" | "medium" | "high";
    recommendation: string;
  }[];
}
```

### 5.2 基线对比

```
版本发布时执行:
  └─ 运行与上次相同的压测场景
  └─ 对比各项指标，判断是否退化

退化判定:
  └─ P99 延迟增加 > 20% → ⚠️ 警告
  └─ P99 延迟增加 > 50% → 🔴 失败
  └─ 错误率增加 > 0.5% → ⚠️ 警告
  └─ 错误率增加 > 1%   → 🔴 失败
  └─ 吞吐量下降 > 20%   → ⚠️ 警告
  └─ 吞吐量下降 > 50%   → 🔴 失败
```

### 5.3 初始基线预估

| 场景 | 并发 | 预估 P99 | 预估 RPS | 预估 CPU | 预估内存 |
|------|------|---------|---------|---------|---------|
| api_call | 200 | 2000ms | 100 | 70% | 75% |
| user_list | 100 | 1000ms | 500 | 50% | 50% |
| finance_query | 50 | 2000ms | 50 | 60% | 60% |
| batch_ops | 20 | 3000ms | 10 | 40% | 40% |
| mixed | 300 | 3000ms | 200 | 80% | 80% |

> 注：上述为预估值，首次压测后更新为实际值。

---

## 6. 容量规划模型

### 6.1 基于压测结果的容量规划

```
输入: 压测得到的最大吞吐量 (RPS_max)
输入: 当前生产环境峰值 RPS (RPS_peak)
输入: 预留容量比例 (buffer_ratio, 默认 50%)

计算: 
  RPS_target = RPS_peak × (1 + buffer_ratio)
  required_instances = ceil(RPS_target / (RPS_max / test_instances))
```

### 6.2 容量规划表

| 环境 | 峰值 RPS | 预期增长 | 所需实例 | 当前实例 | 缺口 |
|------|---------|---------|---------|---------|------|
| 当前 (2026-07) | 50 | — | 2 | 2 | 0 |
| 3 个月后 | 100 | 100% | 4 | 2 | 2 |
| 6 个月后 | 200 | 300% | 8 | 2 | 6 |
| 12 个月后 | 500 | 900% | 20 | 2 | 18 |

### 6.3 数据库容量规划

```
当前 PG 数据库大小: ~2GB
月增长: ~500MB
12 个月后: ~8GB

磁盘需求:
  └─ 数据文件: 8GB
  └─ WAL: 2GB
  └─ 临时文件: 1GB
  └─ 索引重建空间: 4GB
  └─ 合计: 15GB (当前 40GB 磁盘足够)

建议:
  └─ 当前 40GB 磁盘可支撑 12-18 个月
  └─ 12 个月后考虑扩容到 80GB
  └─ 数据量超过 50GB 时考虑读写分离
```

---

## 7. 压测工具选型

### 7.1 工具对比

| 工具 | 优点 | 缺点 | 推荐场景 |
|------|------|------|---------|
| **k6** | JS 脚本化、CI 集成、内置指标、开源 | 分布式需要 Grafana Cloud | ✅ 生产压测 |
| **autocannon** | Node.js 原生、简单易用 | 单机、功能有限 | ✅ 本地开发压测 |
| **wrk** | 性能极高、C 实现 | 脚本能力弱 | 原始性能测试 |
| **artillery** | YAML 配置、场景丰富 | 性能低于 k6 | 端到端压测 |
| **Postman** | 可视化、易用 | 不适合高并发 | 功能验证 |

### 7.2 推荐方案

```
本地开发: autocannon
  └─ 快速验证简单场景

测试环境: k6
  └─ 完整压测流程
  └─ CI/CD 集成
  └─ 指标输出

生产环境 (只读): k6 (受限模式)
  └─ 只读端点
  └─ 低并发 < 50
  └─ 避开高峰期
```

### 7.3 k6 配置模板

```javascript
// load-test.js — k6 通用压测脚本
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 自定义指标
const errorRate = new Rate('errors');
const apiCallDuration = new Trend('api_call_duration');
const userListDuration = new Trend('user_list_duration');

// 配置
export const options = {
  stages: [
    { duration: '1m', target: 50 },   // 预热
    { duration: '3m', target: 100 },  // 递增
    { duration: '5m', target: 200 },  // 峰值
    { duration: '2m', target: 0 },    // 回退
  ],
  thresholds: {
    http_req_duration: ['p(99)<3000'],
    http_req_failed: ['rate<0.01'],
    errors: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const ADMIN_KEY = __ENV.ADMIN_KEY || 'test_key';

export default function () {
  // 混合场景: 60% API 调用, 20% 用户查询, 10% 财务查询, 10% 登录
  const rand = Math.random();

  if (rand < 0.6) {
    apiCallScenario();
  } else if (rand < 0.8) {
    userListScenario();
  } else if (rand < 0.9) {
    financeQueryScenario();
  } else {
    authScenario();
  }

  sleep(0.5);
}

function apiCallScenario() {
  const res = http.post(`${BASE_URL}/api/v1/chat/completions`, JSON.stringify({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: 'Hello' }],
    max_tokens: 100,
  }), {
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ADMIN_KEY}` },
  });
  apiCallDuration.add(res.timings.duration);
  check(res, { 'api_call status 200': (r) => r.status === 200 });
  errorRate.add(res.status !== 200);
}

function userListScenario() {
  const res = http.get(`${BASE_URL}/api/v1/admin/users?page=1&pageSize=20`, {
    headers: { 'X-Admin-Key': ADMIN_KEY },
  });
  userListDuration.add(res.timings.duration);
  check(res, { 'user_list status 200': (r) => r.status === 200 });
  errorRate.add(res.status !== 200);
}

function financeQueryScenario() {
  const res = http.get(`${BASE_URL}/api/v1/admin/finance/revenue?period=this_month`, {
    headers: { 'X-Admin-Key': ADMIN_KEY },
  });
  check(res, { 'finance status 200': (r) => r.status === 200 });
  errorRate.add(res.status !== 200);
}

function authScenario() {
  const res = http.post(`${BASE_URL}/api/v1/auth/login`, JSON.stringify({
    email: 'test@test.com',
    password: 'test_password',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  check(res, { 'auth status 200': (r) => r.status === 200 });
  errorRate.add(res.status !== 200);
}
```

---

## 8. 压测执行流程

### 8.1 执行步骤

```
阶段 1: 准备 (30 分钟)
  └─ 确定测试环境就绪
  └─ 准备测试数据（用户、API Key、财务记录）
  └─ 确认监控工具就绪 (Grafana / 日志)
  └─ 设置压测工具

阶段 2: 预热 (1 分钟)
  └─ 低并发运行，让系统 JIT 预热
  └─ 确认端点正常响应

阶段 3: 逐场景压测 (30 分钟)
  └─ 按 2.2 节定义逐个场景执行
  └─ 每个场景完成后记录指标
  └─ 等待系统恢复（5 分钟间隔）

阶段 4: 混合场景压测 (30 分钟)
  └─ 按流量比例混合并发
  └─ 持续监控系统资源

阶段 5: 分析 (30 分钟)
  └─ 汇总指标
  └─ 识别瓶颈
  └─ 生成报告

总耗时: ~2 小时
```

### 8.2 安全措施

```
压测安全原则:
  └─ 始终使用测试数据（非生产数据）
  └─ 设置最大并发上限（不超过 500）
  └─ 设置超时保护（单请求超时 30s）
  └─ 压测前通知相关人员
  └─ 准备应急预案（立即停止压测）

停止条件:
  └─ 错误率 > 5%
  └─ 数据库连接池耗尽
  └─ 磁盘使用率 > 95%
  └─ 收到人工干预指令
```

---

## 9. 压测报告结构

### 9.1 报告模板

```markdown
# 压测报告 - 3cloud API v2.1.0

## 基本信息
- **测试日期**: 2026-07-28
- **测试环境**: 生产服规格测试环境 (2C/1.7G/40G)
- **应用版本**: v2.1.0 (commit: a1b2c3d)
- **测试工具**: k6 v0.48.0
- **测试人员**: [姓名]

## 测试结果摘要

| 场景 | 并发 | P50 | P95 | P99 | RPS | 错误率 | 状态 |
|------|------|-----|-----|-----|-----|-------|------|
| api_call | 200 | 800ms | 1800ms | 2500ms | 95 | 0.3% | ✅ |
| user_list | 100 | 200ms | 500ms | 800ms | 450 | 0.1% | ✅ |
| finance_query | 50 | 800ms | 1500ms | 2000ms | 48 | 0.2% | ✅ |
| batch_ops | 20 | 1500ms | 3000ms | 4500ms | 8 | 0.5% | ⚠️ |
| mixed | 300 | 900ms | 2000ms | 2800ms | 180 | 0.4% | ✅ |

## 系统资源

| 指标 | 压测前 | 压测峰值 | 恢复后 |
|------|-------|---------|-------|
| CPU | 15% | 85% | 20% |
| 内存 | 45% | 78% | 50% |
| 磁盘 I/O | 10% | 65% | 15% |
| 数据库连接 | 5 | 28 | 8 |

## 发现的瓶颈

| # | 类型 | 描述 | 严重级 | 建议 |
|---|------|------|-------|------|
| 1 | 数据库 | 大批量财务查询时索引扫描变慢 | medium | 追加复合索引 |
| 2 | 内存 | 批量操作时内存暴涨 | low | 优化批量处理分批 |
| 3 | Redis | 限流计数器竞争 | low | 考虑 Pipeline |

## 与前次基线对比

| 场景 | 上次 P99 | 本次 P99 | 变化 | 判定 |
|------|---------|---------|------|------|
| api_call | 2600ms | 2500ms | -3.8% | ✅ 无退化 |
| user_list | 750ms | 800ms | +6.7% | ✅ 无退化 |
| mixed | 2900ms | 2800ms | -3.4% | ✅ 无退化 |

## 结论
- 系统在 300 并发下表现稳定，未发现明显瓶颈
- 批量操作场景需要优化，P99 接近阈值
- 建议在下次发布前优化批量操作数据库查询
```

---

## 10. 运营配置项

| 配置项 | 路径 | 类型 | 默认值 | 说明 |
|-------|------|------|--------|------|
| 压测模式启用 | `site_configs.load_test.enabled` | boolean | false | 开启后禁用外部通知 |
| 压测模式 IP 白名单 | `site_configs.load_test.ip_whitelist` | json | `[]` | 仅允许白名单 IP 在压测模式访问 |
| 压测最大并发 | `site_configs.load_test.max_concurrency` | int | 500 | 安全保护 |
| 压测超时 | `site_configs.load_test.request_timeout_ms` | int | 30000 | — |

---

## 11. 边界条件与假设

### 11.1 假设

| # | 假设 | 说明 |
|---|------|------|
| A1 | 压测环境与生产环境配置接近 | 否则压测结果无参考价值 |
| A2 | 第三方供应商 API 响应稳定 | 路由压测依赖供应商正常响应 |
| A3 | 测试数据量级与生产接近 | 数据量太小会导致缓存命中率过高 |
| A4 | 压测期间无其他负载 | 避免干扰测试结果 |

### 11.2 边界条件

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B1 | 压测工具本身成为瓶颈 | 使用分布式压测（多台机器同时施压）|
| B2 | 网络带宽限制 | 压测前确认带宽充足，否则压测结果有偏差 |
| B3 | 数据库连接数耗尽 | 压测前临时增加 max_connections |
| B4 | 磁盘空间不足无法记录日志 | 压测前清理磁盘，确保足够空间 |
| B5 | 压测过程系统崩溃 | 自动停止压测，保留现有数据，分析原因 |
| B6 | 测试数据不具代表性 | 使用生产数据脱敏后的副本 |

---

## 12. 验收标准

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC1 | 单场景压测 | 每个场景按定义执行，指标记录完整 |
| AC2 | 混合场景压测 | 按比例混合并发，系统稳定运行 30 分钟 |
| AC3 | 限流验证 | 超载时限流正确触发，返回 429 |
| AC4 | 熔断验证 | 供应商超时后熔断器正确切换 |
| AC5 | 性能基线 | 输出基线数据，可重复对比 |
| AC6 | 报告生成 | 压测报告完整，包含所有指标 |
| AC7 | 安全保护 | 压测模式启用后外部请求被限制 |

---

## 13. 交叉引用

| 关联模块 | 文档 | 关系 |
|---------|------|------|
| 健康巡检 | `ref-4.18-kpi-drill-healthcheck.md` | 压测后的系统恢复验证 |
| 限流引擎 | `ref-5.3-rate-limit.md` | 限流验证场景 |
| 熔断器 | `ref-5.1-routing.md` | 熔断验证场景 |
| 部署流水线 | `ref-5.6-auto-ops.md` | 压测集成到发布流程 |
| 监控日志 | `ref-4.7-monitor-logs.md` | 压测指标采集 |