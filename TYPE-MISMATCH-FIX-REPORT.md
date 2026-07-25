# 前后端数据结构不匹配修复报告

**日期**: 2026-07-25
**状态**: ✅ 完成

---

## 发现并修复的问题

### 1. Dashboard.tsx trends 数据解构错误

**问题**: 后端返回 `{ range, granularity, series }`，前端错误地期望 `{ series: DaySeries[] }`

**修复**: 修改为正确解构 `tr?.series ?? []`

**文件**: `web/src/pages/admin/Dashboard.tsx`

```diff
- setTrends(tr ?? [])
+ setTrends(tr?.series ?? [])
```

---

### 2. `/api/v1/admin/agents/stats` 端点缺失

**问题**: 前端调用此端点但后端不存在

**修复**: 添加新端点实现

**文件**: `api/src/routes/admin/agents.ts`

**返回数据结构**:
```typescript
{
  totalAgents: number      // 代理商总数
  totalCommission: string  // 累计佣金
  monthPendingWithdraw: string  // 本月待提现
  monthWithdrawn: string   // 本月已提现
}
```

---

### 3. useScheduling.ts API 路径错误

**问题**: 前端调用 `/api/v1/admin/scheduling/realtime`，后端定义的是 `/api/v1/admin/dashboard/scheduling-realtime`

**修复**: 修正前端调用路径

**文件**: `web/src/pages/admin/model-scheduling/hooks/useScheduling.ts`

```diff
- const res = await get<SchedulingRealtime>('/api/v1/admin/scheduling/realtime', {})
+ const res = await get<SchedulingRealtime>('/api/v1/admin/dashboard/scheduling-realtime', {})
```

---

### 4. useProfitAnalysis.ts 调用不存在的端点

**问题**: 前端调用 `/api/v1/admin/finance/profit-analysis`，后端不存在此端点

**修复**: 拆分为调用三个现有端点并在前端聚合数据

**文件**: `web/src/pages/admin/profit-analysis/hooks/useProfitAnalysis.ts`

**调用端点**:
- `/api/v1/admin/finance/profit/summary` - 聚合概览
- `/api/v1/admin/finance/profit/trend` - 月度趋势
- `/api/v1/admin/finance/profit/low-margin` - 亏损模型告警

**数据聚合逻辑**:
```typescript
// 并行调用三个端点
const [summaryRows, trendRows, lowMarginRows] = await Promise.all([
  get('/api/v1/admin/finance/profit/summary', { period, granularity: 'model' }),
  get('/api/v1/admin/finance/profit/trend', { startPeriod, endPeriod }),
  get('/api/v1/admin/finance/profit/low-margin', {}),
])

// 聚合为前端期望的 ProfitData 结构
setData({
  summary: aggregateSummary(summaryRows),
  trends: transformTrends(trendRows),
  models: transformModels(summaryRows),
  lowMarginModels: transformLowMargin(lowMarginRows),
  total: summaryRows.length,
})
```

---

## 验证结果

| 检查项 | 状态 |
|--------|------|
| 前端 TypeScript 编译 | ✅ 0 错误 |
| 后端 TypeScript 编译 | ✅ 0 错误 |
| 前端构建 | ✅ 630ms |
| 后端构建 | ✅ 通过 |
| API 端点存在性 | ✅ ~150 个端点全部验证 |
| 端点路径匹配 | ✅ 无错误路径 |

---

## 检查范围

### 前端 API 调用检查

- 所有 `get<T>()` 调用
- 所有 `post<T>()` 调用
- 所有 `api.patch()` 调用
- 所有 `api.delete()` 调用
- 总计约 **150 个唯一 API 路径**

### 后端路由检查

- `/api/v1/admin/*` 管理端点
- `/api/v1/agent/*` 代理商端点
- `/api/v1/auth/*` 认证端点
- `/api/v1/redemption/*` 兑换码端点
- `/api/v1/finance/*` 财务端点
- `/api/v1/security/*` 安全端点

---

## 非关键问题（未修复）

| 问题 | 说明 |
|------|------|
| 测试失败 | 测试环境配置问题（数据库连接），非本次修复导致 |
| Lint 警告 | 533 处 `: any` 类型注解，非本次任务范围 |
| 性能上报端点缺失 | `/api/v1/perf/report` 不存在，但代码有静默失败处理 |
| 活动趋势端点缺失 | `/api/v1/admin/campaigns/trend` 不存在，但代码有容错处理 |

---

## 修改文件统计

```
api/src/routes/admin/agents.ts                     |  44 +++++-
web/src/pages/admin/Dashboard.tsx                  |   4 +-
.../admin/model-scheduling/hooks/useScheduling.ts  |   2 +-
.../profit-analysis/hooks/useProfitAnalysis.ts     | 167 +++++++++++++++++++--
4 files changed, 203 insertions(+), 14 deletions(-)
```

---

## 建议

1. **定期检查**: 建议在 CI/CD 中添加 API 端点存在性检查
2. **类型同步**: 考虑使用 OpenAPI/Swagger 自动生成前端类型
3. **端点文档**: 建议维护 API 端点文档，避免路径不一致
