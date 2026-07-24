# PromptAudit.tsx 拆分计划

**源文件**: `3cloud/web/src/pages/admin/PromptAudit.tsx` (618 行)
**目标**: 拆分为 types + hooks + components

## 拆分策略

### 1. Types (types.ts)
- PromptAuditItem / PromptAuditDetail / AuditStats 接口

### 2. Hooks
- `usePromptAudit.ts` - 审计日志加载 + 审核操作

### 3. Components
- `AuditTable.tsx` - 审计日志表格
- `AuditDetail.tsx` - 详情弹窗
- `AuditStats.tsx` - 统计卡片

## 预期结果
- 主文件: 618 → ~120 行
- 新增文件: 1 hook + 3 components + types

## 状态: ✅ 已完成
**结果**: 主文件 618 → 182 行（减少 71%）
**产出**: 1 Hook + 2 组件