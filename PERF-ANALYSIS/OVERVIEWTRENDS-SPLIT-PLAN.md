# OverviewTrends.tsx 拆分计划

**源文件**: `3cloud/web/src/pages/admin/dashboard/OverviewTrends.tsx` (756 行)
**约束**: Dashboard.tsx 传递 props，需保持接口兼容

## Props 接口
```typescript
interface OverviewTrendsProps {
  series: DaySeries[]
  days: number
  onDaysChange: (days: number) => void
  loading: boolean
  onRefresh: () => void
}
```

## 拆分策略

### 1. Types (types.ts)
- DaySeries, HourEntry, HourlyData, CompareData 接口
- MetricKey, ChartStyle 类型
- METRICS 配置

### 2. Hooks
- `useOverviewTrends.ts` - 内部状态管理

### 3. Components
- `TrendChart.tsx` - 趋势图表
- `MetricSelector.tsx` - 指标选择器

## 预期结果
- 主文件: 756 → ~150 行
- 新增文件: 1 hook + 2 components + types

## 状态: ✅ 已完成
**结果**: 主文件 756 → 112 行（减少 85%）
**产出**: 1 Hook + 2 组件 + types