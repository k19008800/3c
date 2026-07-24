# Vendors.tsx 拆分计划

**源文件**: `3cloud/web/src/pages/admin/Vendors.tsx` (558 行)
**目标**: 拆分为 types + hooks + components

## 拆分策略

### 1. Types (types.ts)
- VendorRow 接口

### 2. Hooks
- `useVendors.ts` - 供应商数据加载

### 3. Components
- `VendorTable.tsx` - 供应商表格
- `VendorForm.tsx` - 编辑表单

## 预期结果
- 主文件: 558 → ~100 行
- 新增文件: 1 hook + 2 components + types

## 状态: ✅ 已完成
**结果**: 主文件 558 → 201 行（减少 64%）
**产出**: 1 Hook + 1 组件 + types