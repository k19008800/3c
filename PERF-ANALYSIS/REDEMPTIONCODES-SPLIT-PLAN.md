# RedemptionCodes.tsx 拆分计划

**文件**: `web/src/pages/admin/RedemptionCodes.tsx`
**当前行数**: 959
**目标**: 拆分为 ~150 行主组件 + 多个子组件

---

## 一、现有结构分析

### 已有子组件（redemption/）
- `StatsCards.tsx` - 统计卡片
- `BatchCreateForm.tsx` - 批次创建表单
- `AgentOverview.tsx` - 代理总览
- `AgentCodeDetail.tsx` - 代理码详情
- `CodeList.tsx` - 码列表
- `CodeDetail.tsx` - 码详情（含 GiftModal、BatchEditModal）
- `types.ts` - 类型定义

### 主文件剩余内容
1. **State 定义** (~100行) - 9 个 Tab 的状态
2. **Fetch handlers** (~150行) - 11 个 fetch 函数
3. **Action handlers** (~150行) - 20+ 个操作函数
4. **JSX 渲染** (~550行) - 7 个 Tab 的内联 JSX

---

## 二、拆分策略

### 2.1 提取 Hooks

创建 `hooks/` 目录：

| Hook | 职责 | 预计行数 |
|------|------|----------|
| `useRedemptionStats.ts` | 统计数据获取 | ~30 |
| `useRedemptionBatches.ts` | 批次列表 + 操作 | ~80 |
| `useRedemptionCodes.ts` | 码列表 + 批量操作 | ~100 |
| `useRedemptionLogs.ts` | 兑换流水 + 筛选 | ~60 |
| `useRedemptionFraud.ts` | 风控数据 + 操作 | ~120 |
| `useRedemptionAgent.ts` | 代理数据 | ~60 |
| `useRedemptionAudit.ts` | 审计日志 | ~40 |

### 2.2 提取 Tab 组件

创建 `components/` 目录：

| 组件 | 职责 | 预计行数 |
|------|------|----------|
| `BatchesTab.tsx` | 批次列表 Tab | ~150 |
| `LogsTab.tsx` | 兑换流水 Tab | ~120 |
| `FraudTab.tsx` | 风控 Tab | ~200 |
| `AuditLogsTab.tsx` | 审计日志 Tab | ~100 |
| `ReportsTab.tsx` | 报表导出 Tab | ~80 |

### 2.3 主组件重构

`RedemptionCodes.tsx` 最终结构：
```tsx
// 1. Imports (~20行)
// 2. Tab 类型定义 (~5行)
// 3. 主组件 (~100行)
//    - Tab 状态
//    - Hooks 调用
//    - Tab 切换 JSX
```

---

## 三、执行步骤

### Step 1: 创建目录结构
```bash
mkdir -p web/src/pages/admin/redemption/hooks
mkdir -p web/src/pages/admin/redemption/components
```

### Step 2: 提取 Hooks（按依赖顺序）
1. `useRedemptionStats.ts` (无依赖)
2. `useRedemptionBatches.ts` (依赖 stats)
3. `useRedemptionCodes.ts` (依赖 stats)
4. `useRedemptionLogs.ts` (独立)
5. `useRedemptionFraud.ts` (独立)
6. `useRedemptionAgent.ts` (独立)
7. `useRedemptionAudit.ts` (独立)

### Step 3: 提取 Tab 组件
1. `BatchesTab.tsx`
2. `LogsTab.tsx`
3. `FraudTab.tsx`
4. `AuditLogsTab.tsx`
5. `ReportsTab.tsx`

### Step 4: 重构主组件
- 移除内联 JSX
- 使用提取的 Hooks 和组件
- 保持 Tab 切换逻辑

### Step 5: 验证构建
```bash
cd web && npm run build
```

---

## 四、预期收益

| 指标 | 当前 | 目标 | 提升 |
|------|------|------|------|
| 主文件行数 | 959 | ~150 | **84%** |
| 最大 Hook 行数 | - | ~120 | 可控 |
| 最大组件行数 | - | ~200 | 可控 |
| 可复用 Hooks | 0 | 7 | 新增 |

---

## 五、风险控制

1. **渐进式拆分** - 每个 Hook/组件单独提取，立即验证构建
2. **类型安全** - 所有类型从 `types.ts` 导入，确保一致
3. **回滚机制** - 保留 `.backup` 文件

---

**状态**: ✅ 已完成
**结果**: 主文件 959 → 353 行（减少 63%）
**产出**: 7 Hooks + 5 Tab 组件
