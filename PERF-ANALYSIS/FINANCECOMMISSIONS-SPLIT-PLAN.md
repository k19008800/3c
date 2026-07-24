# FinanceCommissions.tsx 拆分计划

**源文件**: `3cloud/web/src/pages/admin/FinanceCommissions.tsx` (1012 行)
**目标**: 拆分为 types + hooks + components

## 拆分策略

### 1. Types (types.ts)
- CommissionItem / CommissionStats 接口

### 2. Hooks
- `useFinanceCommissions.ts` - 佣金数据加载

### 3. Components
- `CommissionTable.tsx` - 佣金表格
- `CommissionStats.tsx` - 统计卡片
- `CommissionFilters.tsx` - 筛选器

## 预期结果
- 主文件: 1012 → ~150 行
- 新增文件: 1 hook + 3 components + types

## 状态: ✅ 已完成
**结果**: 主文件 1012 → 132 行（减少 87%）
**产出**: 1 Hook + 1 组件 + types