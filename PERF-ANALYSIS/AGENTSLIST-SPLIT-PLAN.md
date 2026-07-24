# AgentsList.tsx 拆分计划

**源文件**: `3cloud/web/src/pages/admin/AgentsList.tsx` (583 行)
**约束**: Agents.tsx 传递 `onStatsChange` prop

## Props 接口
```typescript
interface AgentsListProps {
  onStatsChange?: () => void
}
```

## 拆分策略

### 1. Types (types.ts)
- AgentsListProps 接口

### 2. Hooks
- `useAgentsList.ts` - 代理商数据加载

### 3. Components
- `AgentTable.tsx` - 代理商表格

## 预期结果
- 主文件: 583 → ~120 行
- 新增文件: 1 hook + 1 组件 + types

## 状态: ✅ 已完成
**结果**: 主文件 583 → 171 行（减少 71%）
**产出**: 1 Hook + 1 组件 + types