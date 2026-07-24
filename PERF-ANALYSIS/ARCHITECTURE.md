# 3cloud 架构图谱

> 生成时间：2026-07-23
> 分析范围：全量代码梳理

---

## 一、项目规模统计

| 维度 | 数量 |
|------|------|
| **后端路由文件** | 150 个 |
| **后端端点数** | 571 个 |
| **后端服务文件** | 313 个 |
| **前端页面数** | 166 个 |
| **前端组件数** | ~200+ 个 |

---

## 二、后端架构分层

### 2.1 入口层

```
src/app/index.ts
  ├─ buildApp() — Fastify 实例构建
  ├─ registerPlugins() — 插件注册
  ├─ registerRoutes() — 路由注册
  └─ registerCronJobs() — 定时任务
```

### 2.2 路由层（150 文件，571 端点）

**核心路由模块**：

| 模块 | 路由文件 | 端点数（估算）| 功能 |
|------|----------|-------------|------|
| **认证** | `routes/auth/` | ~20 | 登录/注册/密码重置/JWT |
| **API Key** | `routes/api-keys.js` | ~10 | 用户 API Key 管理 |
| **Token 代理** | `routes/proxy.js` | ~5 | 核心计费转发 |
| **充值** | `routes/recharge.js` | ~15 | 充值订单/支付 |
| **代理商** | `routes/agent/` | ~30 | 代理商体系 |
| **兑换码** | `routes/redemption/` | ~25 | 兑换码系统 |
| **Admin 用户** | `routes/admin/users/` | ~20 | 用户管理 |
| **Admin 供应商** | `routes/admin/vendors.js` | ~15 | 供应商管理 |
| **Admin 模型** | `routes/admin/models.js` | ~10 | 模型管理 |
| **Admin 财务** | `routes/admin/finance.js` | ~30 | 财务结算 |
| **Admin 安全** | `routes/admin/security/` | ~25 | 安全风控 |
| **Admin 审计** | `routes/admin/audit-logs.js` | ~10 | 审计日志 |
| **其他** | ... | ~346 | 统计/通知/配置等 |

### 2.3 服务层（313 文件）

**核心服务**：

| 服务 | 文件 | 职责 |
|------|------|------|
| **计费引擎** | `services/billing/` | Token 扣费、余额计算 |
| **路由引擎** | `services/router.ts` | 模型路由选择 |
| **限流引擎** | `services/rate-limiter.ts` | TPM/RPM 限流 |
| **熔断器** | `services/circuit-breaker/` | 故障熔断 |
| **代理商** | `services/agent-*.ts` | 代理商体系 |
| **兑换码** | `services/redemption-*.ts` | 兑换码系统 |
| **财务** | `services/finance.ts` | 财务结算 |
| **通知** | `services/notification-service.ts` | 站内信/邮件 |
| **安全** | `services/security/` | 安全风控 |

### 2.4 数据层

**数据库**：PostgreSQL 17 + DrizzleORM

**核心表**（按大小排序）：

| 表名 | 用途 | 索引数 | 分区 |
|------|------|--------|------|
| `call_logs` | Token 调用日志 | ? | 待分析 |
| `balance_logs` | 余额变动日志 | ? | 待分析 |
| `users` | 用户表 | ? | - |
| `api_keys` | API Key 表 | ? | - |
| `agents` | 代理商表 | ? | - |
| `vendors` | 供应商表 | ? | - |
| `vendor_models` | 供应商模型关联 | ? | - |
| `redemption_codes` | 兑换码表 | ? | - |
| `commission_logs` | 佣金日志 | ? | - |

**Redis 缓存**：
- 用户会话
- API Key 缓存
- 限流计数器
- 熔断器状态

---

## 三、前端架构分层

### 3.1 入口层

```
src/main.tsx
  └─ App.tsx
      ├─ AuthProvider — 认证上下文
      ├─ ImpersonateProvider — 代管上下文
      └─ BrowserRouter
          ├─ PublicLayout — 门户公开页面
          ├─ AppLayout — 用户控制台
          ├─ AdminRoute — 管理后台
          └─ VendorRoute — 供应商自助
```

### 3.2 页面层（166 页面）

**页面分布**：

| 模块 | 页面数 | 路由前缀 |
|------|--------|----------|
| **门户** | 4 | `/` |
| **公共** | 17 | `/login`, `/register`, `/dashboard` 等 |
| **用户控制台** | 15 | `/console/` |
| **管理后台** | 80+ | `/console/admin/` |
| **代理商** | 10+ | `/console/agent/` |
| **供应商** | 5+ | `/console/vendor/` |

### 3.3 组件层

**核心组件**：

| 组件 | 用途 | 复杂度 |
|------|------|--------|
| `AppLayout` | 控制台布局 | 中 |
| `AdminLayout` | 管理后台布局 | 高 |
| `FilterBar` | 筛选栏 | 中 |
| `DataTable` | 数据表格 | 高 |
| `ChartPanel` | 图表面板 | 高 |

---

## 四、核心调用链路

### 4.1 Token 代理调用链（最核心）

```
客户端请求
  → routes/proxy.js
    → auth 中间件（验证 API Key）
    → services/rate-limiter.ts（限流检查）
    → services/circuit-breaker/（熔断检查）
    → services/router.ts（模型路由选择）
    → vendor API（转发请求）
    → services/billing/（计费扣款）
    → 返回响应
```

**性能关键点**：
- API Key 缓存命中率
- 限流计数器性能
- 模型路由选择效率
- 计费计算效率

### 4.2 代理商概览调用链

```
前端请求 /console/agent/dashboard
  → routes/agent/index.js
    → services/agent-core.ts（代理商信息）
    → services/agent-finance.ts（财务数据）
    → services/agent-commission.ts（佣金数据）
    → 返回聚合数据
```

**性能关键点**：
- N+1 查询风险
- 聚合计算效率

### 4.3 充值审核调用链

```
前端请求 /console/admin/recharge-orders/:id/audit
  → routes/admin/recharge-orders.js
    → services/recharge-service/（订单查询）
    → 数据库事务（余额更新）
    → services/notification-service.ts（通知用户）
    → 返回结果
```

**性能关键点**：
- 事务范围
- 通知发送效率

---

## 五、定时任务（Cron）

| 任务 | 时间 | 职责 |
|------|------|------|
| **佣金自动结算** | 每天 03:00 | `settleCommissions()` |
| **对账自动化** | 每天 03:00 | `scheduleDailyRecon()` |
| **结算周期自动结算** | 每天 02:00 + 14:00 | `scheduleAutoSettle()` |
| **对账预计算** | 每天 04:00 | `computeDailyReconSummary()` |
| **安全日报** | 每天 09:00 | `sendDailySecuritySummary()` |
| **佣金日汇总** | 每天 00:30 | `computeDailyCommissionRollup()` |

---

## 六、已知性能热点

| 热点 | 类型 | 影响 | 来源 |
|------|------|------|------|
| **代理商概览 N+1 查询** | 后端 | 200 代理商 → 200 次子查询 | 历史分析 |
| **Redis KEYS 阻塞** | 后端 | KEYS * 扫描阻塞事件循环 | 历史分析 |
| **巨型组件** | 前端 | VendorKeyGroups.tsx 800+ 行 | 历史分析 |
| **无索引查询** | 数据库 | call_logs 全表扫描 | 待验证 |
| **同步 JSON 解析** | 后端 | 大响应体阻塞 | 待验证 |

---

## 七、下一步分析

1. **后端静态分析**（backend-analyzer 运行中）
   - 依赖图
   - 复杂度
   - N+1 查询检测
   - 同步阻塞检测

2. **前端静态分析**（frontend-analyzer 运行中）
   - 组件树
   - 大型组件
   - 重复渲染风险

3. **数据库分析**（database-analyzer 运行中）
   - 表大小
   - 索引使用率
   - 慢查询

等待子代理完成后，汇总为完整热点清单。
