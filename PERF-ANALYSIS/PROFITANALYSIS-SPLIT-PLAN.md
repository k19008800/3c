# ProfitAnalysis.tsx 拆分计划

**源文件**: `3cloud/web/src/pages/admin/ProfitAnalysis.tsx` (637 行)
**目标**: 拆分为 types + hooks + components

## 拆分策略

### 1. Types (types.ts)
- ProfitSummary / ProfitSummaryRow / MonthlyTrend / ModelProfitRow / LowMarginModel 接口

### 2. Hooks
- `useProfitAnalysis.ts` - 利润数据加载

### 3. Components
- `SummaryCards.tsx` - 概览卡片（收入/成本/利润/利润率）
- `TrendChart.tsx` - 月度趋势图
- `ModelTable.tsx` - 模型利润明细表
- `LowMarginAlert.tsx` - 低利润预警

## 预期结果
- 主文件: 637 → ~150 行
- 新增文件: 1 hook + 4 components + types

## 状态: ✅ 已完成
**结果**: 主文件 637 → 82 行（减少 87%）
**产出**: 1 Hook + 4 组件 + utils