# FinanceReconciliation.tsx 拆分计划

**源文件**: `3cloud/web/src/pages/admin/FinanceReconciliation.tsx` (543 行)
**目标**: 拆分为 types + hooks + components

## 拆分策略

### 1. Types (types.ts)
- ReconciliationRow 接口

### 2. Hooks
- `useReconciliation.ts` - 对账数据加载

### 3. Components
- `ReconciliationTable.tsx` - 对账表格

## 预期结果
- 主文件: 543 → ~100 行
- 新增文件: 1 hook + 1 组件 + types

## 状态: ✅ 已完成
**结果**: 主文件 543 → 72 行（减少 87%）
**产出**: 1 Hook + 2 组件 + types