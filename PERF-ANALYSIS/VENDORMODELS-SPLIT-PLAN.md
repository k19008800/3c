# VendorModels.tsx 拆分计划

**源文件**: `3cloud/web/src/pages/admin/VendorModels.tsx` (854行)
**优先级**: P1
**状态**: ✅ 已完成
**结果**: 主文件 854 → 132 行（减少 85%）
**产出**: 1 Hook + 4 组件

## 拆分目标

将 854 行巨型组件拆分为 ~150 行主组件 + 可复用子组件。

## 结构分析

| 区域 | 行数 | 说明 |
|------|------|------|
| 主组件 AdminVendorModels | 1-280 | 列表 + 筛选 + 分页 |
| CreateModal | 280-480 | 新建映射表单 |
| EditModal | 480-680 | 编辑映射表单 |
| DeleteModal | 680-854 | 删除确认 |

## 拆分策略

### 1. 提取 Hooks (→ `hooks/`)

- `useVendorModels.ts` - 列表数据获取 + 筛选 + 分页

### 2. 提取组件 (→ `components/`)

- `ModelTable.tsx` - 表格展示 (~120行)
- `CreateModal.tsx` - 新建表单 (~200行)
- `EditModal.tsx` - 编辑表单 (~200行)
- `DeleteModal.tsx` - 删除确认 (~50行)
- `index.ts` - barrel 文件

### 3. 提取类型 (→ `types.ts`)

- 表单数据类型
- Props 接口

## 目标结构

```
vendor-models/
├── types.ts
├── hooks/
│   ├── useVendorModels.ts
│   └── index.ts
├── components/
│   ├── ModelTable.tsx
│   ├── CreateModal.tsx
│   ├── EditModal.tsx
│   ├── DeleteModal.tsx
│   └── index.ts
└── index.ts (barrel)
```

## 预期收益

- 主文件: 854 → ~150 行 (减少 82%)
- 可复用组件: 4 个
- 可测试 Hooks: 1 个

## 执行步骤

1. [x] 创建目录结构
2. [ ] 提取 types.ts
3. [ ] 提取 useVendorModels hook
4. [ ] 提取 ModelTable 组件
5. [ ] 提取 CreateModal 组件
6. [ ] 提取 EditModal 组件
7. [ ] 提取 DeleteModal 组件
8. [ ] 重构主组件
9. [ ] 构建验证
