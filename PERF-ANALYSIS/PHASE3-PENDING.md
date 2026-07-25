# 3cloud 性能优化 Phase 3 待执行清单

**创建时间**: 2026-07-24 20:10 GMT+8
**计划执行时间**: 2026-07-24 23:00 GMT+8
**当前完成率**: 47% (45/95)

---

## 一、前端巨型组件拆分（14 个待拆分）

### P0 优先级（立即执行）

| 组件 | 原行数 | 目标 | 文件路径 |
|------|--------|------|----------|
| FinanceCommissions.tsx | 1012 | ~200行 | `web/src/pages/admin/finance-commissions/` |

### P1 优先级（短期执行）

| 组件 | 原行数 | 目标 | 文件路径 |
|------|--------|------|----------|
| RedemptionCodes.tsx | 959 | ~200行 | `web/src/pages/admin/redemption-codes/` |
| VendorModels.tsx | 854 | ~200行 | `web/src/pages/admin/vendor-models/` |
| OverviewTrends.tsx | 756 | ~150行 | `web/src/pages/admin/dashboard/` |

### P2 优先级（长期执行）

| 组件 | 原行数 | 目标 | 文件路径 |
|------|--------|------|----------|
| Prices.tsx | 755 | ~150行 | `web/src/pages/admin/prices/` |
| ModelSchedulingRealtime.tsx | 723 | ~150行 | `web/src/pages/admin/model-scheduling/` |
| Roles.tsx | 686 | ~150行 | `web/src/pages/admin/roles/` |
| ProfitAnalysis.tsx | 637 | ~150行 | `web/src/pages/admin/profit-analysis/` |
| PromptAudit.tsx | 618 | ~150行 | `web/src/pages/admin/prompt-audit/` |
| AgentsList.tsx | 583 | ~150行 | `web/src/pages/admin/agents/` |
| Vendors.tsx | 558 | ~150行 | `web/src/pages/admin/vendors/` |
| SensitiveWords.tsx | 544 | ~150行 | `web/src/pages/admin/sensitive-words/` |
| FinanceReconciliation.tsx | 543 | ~150行 | `web/src/pages/admin/finance-reconciliation/` |

### 拆分策略

```typescript
// 拆分模板
<Feature>/
├── index.tsx              // 入口导出
├── <Feature>Page.tsx      // 主页面（~150行）
├── components/
│   ├── <Feature>List.tsx  // 列表组件
│   ├── <Feature>Filters.tsx // 筛选器
│   ├── <Feature>Stats.tsx // 统计卡片
│   ├── <Feature>Form.tsx  // 表单/弹窗
│   └── <Feature>Row.tsx   // 行组件
├── hooks/
│   ├── use<Feature>.ts    // 数据获取
│   └── use<Feature>Actions.ts // 操作逻辑
├── types.ts               // 类型定义
└── utils.ts               // 工具函数
```

---

## 二、后端超大服务拆分（5 个）

| 文件 | 行数 | 目标 | 文件路径 |
|------|------|------|----------|
| reconciliation.ts | 595 | ~150行/模块 | `api/src/services/` |
| review.ts | 442 | ~100行/模块 | `api/src/services/` |
| price-service.ts | 402 | ~100行/模块 | `api/src/services/` |
| notifications.ts | 354 | ~100行/模块 | `api/src/services/` |
| admin.ts | 351 | ~100行/模块 | `api/src/services/` |

### 拆分策略

```typescript
// 拆分模板
services/<feature>/
├── index.ts              // barrel 导出
├── <feature>-core.ts     // 核心逻辑
├── <feature>-queries.ts  // 数据库查询
├── <feature>-utils.ts    // 工具函数
└── <feature>-types.ts    // 类型定义
```

---

## 三、P2 长期优化项（27 项）

### 前端优化

| 优化项 | 说明 | 预估收益 |
|--------|------|----------|
| 虚拟滚动推广 | 其他 10+ 大列表组件 | 渲染性能↑80% |
| React.lazy 路由分割 | 按路由代码分割 | 首屏加载↓50% |
| 图片懒加载 | 减少首屏请求 | 首屏加载↓30% |
| Webpack 构建优化 | 减少构建时间 | 构建时间↓50% |
| Service Worker 缓存 | 静态资源缓存 | 重复访问↑90% |

### 后端优化

| 优化项 | 说明 | 预估收益 |
|--------|------|----------|
| 批量查询缓存 | 统计结果缓存 | 数据库负载↓70% |
| 慢查询日志分析 | pg_stat_statements | 发现隐藏瓶颈 |
| 连接池监控 | 实时连接池状态 | 避免连接耗尽 |
| 请求去重增强 | 更激进的去重策略 | 重复请求↓80% |

### 数据库优化

| 优化项 | 说明 | 预估收益 |
|--------|------|----------|
| 分区表自动创建 | 自动创建下月分区 | 运维自动化 |
| 冷数据归档 | 历史日志归档 | 存储成本↓50% |
| 读写分离评估 | 从库查询分流 | 主库负载↓60% |
| 索引覆盖率分析 | 全量索引审计 | 查询性能↑ |

### 监控与测试

| 优化项 | 说明 | 预估收益 |
|--------|------|----------|
| APM 监控接入 | New Relic / Sentry | 实时性能监控 |
| 性能基准测试 | 自动化性能回归 | 优化可量化 |
| E2E 测试完善 | Cypress / Playwright | 自动化回归 |
| 告警机制配置 | 性能告警阈值 | 快速响应问题 |

---

## 四、执行计划

### 今晚 23:00 执行策略

```
Phase 3 执行流程：
├── Step 1: 拆分 P0 巨型组件
│   └── FinanceCommissions.tsx（1 个子代理）
├── Step 2: 并行拆分 P1 组件
│   ├── RedemptionCodes.tsx（子代理 A）
│   ├── VendorModels.tsx（子代理 B）
│   └── OverviewTrends.tsx（子代理 C）
├── Step 3: 后端服务拆分
│   ├── reconciliation.ts（子代理 D）
│   └── review.ts（子代理 E）
├── Step 4: 验证构建
│   └── npm run build（前端 + 后端）
└── Step 5: 测试运行
    └── npm test（关键测试）
```

### 预估时间

| 步骤 | 预估时间 |
|------|----------|
| Step 1 | 15 分钟 |
| Step 2 | 20 分钟 |
| Step 3 | 15 分钟 |
| Step 4 | 5 分钟 |
| Step 5 | 10 分钟 |
| **合计** | **~65 分钟** |

---

## 五、验证标准

### 构建验证

```bash
# 前端
cd 3cloud/web && npm run build
# 期望：0 errors, <2min

# 后端
cd 3cloud/api && npm run build
# 期望：0 errors
```

### 功能验证

| 验证项 | 方式 |
|--------|------|
| 页面加载 | 访问所有拆分后页面 |
| API 响应 | 测试拆分后服务 |
| 类型检查 | TypeScript 编译 |
| 测试通过 | 运行单元测试 |

---

## 六、风险控制

| 风险 | 缓解措施 |
|------|----------|
| 组件拆分引入 bug | 充分测试 + 保留备份 |
| 构建失败 | 回滚 + 逐个组件验证 |
| 运行时错误 | 开发环境验证后再部署 |
| 类型错误 | TypeScript 严格模式检查 |

---

## 七、产出文件

执行完成后更新以下文件：

- `PERF-OPT-FINAL-REPORT.md` — 更新完成率
- `PERF-ANALYSIS/split-*.md` — 拆分记录
- `PERF-ANALYSIS/PHASE3-COMPLETION.md` — Phase 3 完成报告

---

**状态**: ⏳ 等待 23:00 执行
**定时任务 ID**: c14ed8d0-0984-4a2d-a106-944c6556a1cb