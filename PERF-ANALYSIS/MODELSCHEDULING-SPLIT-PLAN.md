# ModelSchedulingRealtime.tsx 拆分计划

**源文件**: `3cloud/web/src/pages/admin/ModelSchedulingRealtime.tsx` (723 行)
**目标**: 拆分为 types + hooks + components

## 拆分策略

### 1. Types (types.ts)
- SchedulingRule 接口

### 2. Hooks
- `useScheduling.ts` - 调度规则数据

### 3. Components
- `SchedulingTable.tsx` - 规则表格

## 预期结果
- 主文件: 723 → ~120 行
- 新增文件: 1 hook + 1 组件 + types

## 状态: ✅ 已完成
**结果**: 主文件 723 → 102 行（减少 86%）
**产出**: 1 Hook + 1 组件 + types