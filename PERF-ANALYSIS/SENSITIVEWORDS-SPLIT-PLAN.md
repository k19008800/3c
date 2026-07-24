# SensitiveWords.tsx 拆分计划

**源文件**: `3cloud/web/src/pages/admin/SensitiveWords.tsx` (544 行)
**目标**: 拆分为 types + hooks + components

## 拆分策略

### 1. Types (types.ts)
- SensitiveWord interface
- CATEGORIES / SEVERITIES 配置

### 2. Hooks
- `useSensitiveWords.ts` - 敏感词 CRUD

### 3. Components
- `WordTable.tsx` - 敏感词表格
- `WordForm.tsx` - 创建/编辑表单
- `BatchImport.tsx` - 批量导入

## 预期结果
- 主文件: 544 → ~120 行
- 新增文件: 1 hook + 3 components + types

## 状态: ✅ 已完成
**结果**: 主文件 544 → 236 行（减少 57%）
**产出**: 1 Hook + 2 组件