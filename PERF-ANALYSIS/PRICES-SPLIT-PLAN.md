# Prices.tsx 拆分计划

**源文件**: `3cloud/web/src/pages/admin/finance/Prices.tsx` (755 行)
**目标**: 拆分为 types + hooks + components

## 拆分策略

### 1. Types (types.ts)
- PriceItem / PriceFilters 接口

### 2. Hooks
- `usePrices.ts` - 价格数据加载 + CRUD

### 3. Components
- `PriceTable.tsx` - 价格表格
- `PriceForm.tsx` - 编辑表单

## 预期结果
- 主文件: 755 → ~120 行
- 新增文件: 1 hook + 2 components + types

## 状态: ✅ 已完成
**结果**: 主文件 755 → 182 行（减少 76%）
**产出**: 1 Hook + 1 组件 + types