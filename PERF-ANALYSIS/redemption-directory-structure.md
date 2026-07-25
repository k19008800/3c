# Redemption 模块目录结构

## 整体结构
```
3cloud/web/src/pages/admin/
├── RedemptionCodes.tsx              (353行)  # 主页面组件
└── redemption/                      # 兑换码管理模块
    ├── types.ts                     # 类型定义
    ├── StatsCards.tsx               # 统计卡片组件
    ├── BatchCreateForm.tsx          # 批次创建表单
    ├── AgentOverview.tsx            # 代理总览组件
    ├── AgentCodeDetail.tsx          # 代理码详情组件
    ├── CodeList.tsx                 # 兑换码列表组件
    ├── CodeDetail.tsx               # 码详情组件（含模态框）
    ├── components/                  # Tab组件目录
    │   ├── BatchesTab.tsx           # 批次列表Tab
    │   ├── LogsTab.tsx              # 兑换流水Tab
    │   ├── FraudTab.tsx             # 风控Tab
    │   ├── AuditLogsTab.tsx         # 审计日志Tab
    │   ├── ReportsTab.tsx           # 报表导出Tab
    │   └── index.ts                 # 组件导出
    └── hooks/                       # 自定义Hooks目录
        ├── useRedemptionStats.ts    # 统计数据Hook
        ├── useRedemptionBatches.ts  # 批次数据Hook
        ├── useRedemptionCodes.ts    # 兑换码数据Hook
        ├── useRedemptionLogs.ts     # 兑换流水Hook
        ├── useRedemptionFraud.ts    # 风控数据Hook
        ├── useRedemptionAgent.ts    # 代理数据Hook
        ├── useRedemptionAudit.ts    # 审计日志Hook
        └── index.ts                 # Hook导出
```

## 详细文件说明

### 1. 主页面组件 (`RedemptionCodes.tsx`)
**职责**：页面入口，Tab状态管理，组件组合
**行数**：353
**主要功能**：
- 定义9个Tab状态
- 调用7个数据Hook
- 渲染Tab切换器
- 组合各个Tab组件

### 2. 类型定义 (`types.ts`)
**职责**：统一的类型定义
**主要类型**：
- `RedemptionCode` - 兑换码类型
- `RedemptionBatch` - 批次类型
- `RedemptionLog` - 兑换记录类型
- `RedemptionFraudEvent` - 风控事件类型
- `RedemptionAgent` - 代理类型

### 3. 功能组件

#### `StatsCards.tsx`
**职责**：显示统计卡片（总量、已用、剩余、金额等）
**依赖**：`useRedemptionStats`

#### `BatchCreateForm.tsx`
**职责**：创建新兑换码批次表单
**功能**：表单验证、API调用、成功回调

#### `AgentOverview.tsx`
**职责**：代理业绩总览
**功能**：代理列表、业绩统计、详情钻取

#### `AgentCodeDetail.tsx`
**职责**：单个代理的兑换码详情
**功能**：分页列表、强制操作（作废/禁用/延期）

#### `CodeList.tsx`
**职责**：兑换码列表显示和操作
**功能**：分页、筛选、批量操作、单码操作

#### `CodeDetail.tsx`
**职责**：码详情模态框
**包含**：
- `GiftModal` - 转赠模态框
- `BatchEditModal` - 批次编辑模态框

### 4. Tab组件 (`components/`)

#### `BatchesTab.tsx`
**职责**：批次管理Tab
**功能**：批次列表、状态切换、编辑、导出

#### `LogsTab.tsx`
**职责**：兑换流水Tab
**功能**：流水列表、时间筛选、分页

#### `FraudTab.tsx`
**职责**：风控管理Tab
**功能**：风控事件、IP封禁、批量处理

#### `AuditLogsTab.tsx`
**职责**：审计日志Tab
**功能**：操作日志、时间筛选、分页

#### `ReportsTab.tsx`
**职责**：报表导出Tab
**功能**：月报、代理报、活动报导出

### 5. 自定义Hooks (`hooks/`)

#### `useRedemptionStats.ts`
**职责**：统计数据获取
**数据**：总量、已用、剩余、金额统计
**方法**：`refetch()`

#### `useRedemptionBatches.ts`
**职责**：批次数据管理
**数据**：批次列表、分页、状态
**方法**：`toggleStatus()`, `exportBatch()`, `createBatch()`

#### `useRedemptionCodes.ts`
**职责**：兑换码数据管理
**数据**：码列表、分页、筛选、选择状态
**方法**：`revoke()`, `batchAction()`, `exportUnused()`

#### `useRedemptionLogs.ts`
**职责**：兑换流水管理
**数据**：流水列表、分页、筛选
**方法**：`applyFilter()`, `resetFilter()`

#### `useRedemptionFraud.ts`
**职责**：风控数据管理
**数据**：风控事件、封禁IP、统计数据
**方法**：`banIp()`, `unbanIp()`, `acknowledge()`, `riskBatchAction()`

#### `useRedemptionAgent.ts`
**职责**：代理数据管理
**数据**：代理列表、代理详情、代理兑换码
**方法**：`viewDetail()`, `backToOverview()`, `forceRevoke()`

#### `useRedemptionAudit.ts`
**职责**：审计日志管理
**数据**：日志列表、分页、筛选
**方法**：`fetchLogs()`, `applyFilter()`

## 依赖关系图

```
RedemptionCodes.tsx
    ├── useRedemptionStats.ts
    ├── useRedemptionBatches.ts
    ├── useRedemptionCodes.ts
    ├── useRedemptionLogs.ts
    ├── useRedemptionFraud.ts
    ├── useRedemptionAgent.ts
    └── useRedemptionAudit.ts
    ├── StatsCards.tsx ─┐
    ├── BatchCreateForm.tsx ─┐
    ├── AgentOverview.tsx ─┐
    ├── AgentCodeDetail.tsx ─┐
    ├── CodeList.tsx ─┐
    ├── CodeDetail.tsx ─┐
    ├── components/BatchesTab.tsx ─┐
    ├── components/LogsTab.tsx ─┐
    ├── components/FraudTab.tsx ─┐
    ├── components/AuditLogsTab.tsx ─┐
    └── components/ReportsTab.tsx ─┐
        └── types.ts (所有组件和Hook共用)
```

## 导入导出模式

### 1. Hook导出 (`hooks/index.ts`)
```typescript
export { useRedemptionStats } from './useRedemptionStats'
export { useRedemptionBatches } from './useRedemptionBatches'
export { useRedemptionCodes } from './useRedemptionCodes'
export { useRedemptionLogs } from './useRedemptionLogs'
export { useRedemptionFraud } from './useRedemptionFraud'
export { useRedemptionAgent } from './useRedemptionAgent'
export { useRedemptionAudit } from './useRedemptionAudit'
```

### 2. 组件导出 (`components/index.ts`)
```typescript
export { default as BatchesTab } from './BatchesTab'
export { default as LogsTab } from './LogsTab'
export { default as FraudTab } from './FraudTab'
export { default as AuditLogsTab } from './AuditLogsTab'
export { default as ReportsTab } from './ReportsTab'
```

### 3. 类型导出 (`types.ts`)
```typescript
export type { RedemptionCode, RedemptionBatch, RedemptionLog, /* ... */ }
```

## 使用示例

### 主页面导入模式
```typescript
import { useState } from 'react'
import { Gift, Plus, Download } from 'lucide-react'

// 导入Hook
import {
  useRedemptionStats,
  useRedemptionBatches,
  useRedemptionCodes,
  useRedemptionLogsAuto,
  useRedemptionFraudAuto,
  useRedemptionAgentAuto,
  useRedemptionAuditAuto,
} from './redemption/hooks'

// 导入组件
import StatsCards from './redemption/StatsCards'
import BatchCreateForm from './redemption/BatchCreateForm'
import CodeList from './redemption/CodeList'
import { BatchesTab, LogsTab, FraudTab, AuditLogsTab, ReportsTab } from './redemption/components'

// 导入类型
import type { RedemptionBatch, RedemptionCode } from './redemption/types'
```

### Hook使用示例
```typescript
// 使用统计数据Hook
const stats = useRedemptionStats()
// stats: { stats: {...}, loading: boolean, refetch: () => void }

// 使用兑换码数据Hook  
const codes = useRedemptionCodes()
// codes: { codes: [...], total: number, page: number, revoke: (id) => Promise<void>, ... }
```

## 最佳实践

### 1. 组件导入
- 优先从 `components/index.ts` 导入Tab组件
- 功能组件直接导入
- 类型从 `types.ts` 导入

### 2. Hook使用
- 使用 `useRedemption*Auto` 的Hook处理自动加载
- 手动调用 `refetch()` 更新数据
- 处理Hook返回的错误状态

### 3. 状态管理
- Tab状态保留在主组件
- 数据状态移入Hook
- UI状态可在组件内部管理

### 4. 错误处理
- 每个Hook包含错误状态
- 操作函数包含try-catch
- 显示用户友好的错误信息

## 扩展指南

### 新增Tab
1. 在 `RedemptionCodes.tsx` 中添加Tab类型
2. 创建对应的Hook（如果需要新数据）
3. 创建Tab组件
4. 添加到Tab切换器

### 新增操作
1. 在对应的Hook中添加方法
2. 在组件中调用Hook方法
3. 更新类型定义（如果需要）

### 优化性能
1. 使用 `React.memo` 包装纯组件
2. 使用 `useCallback` 包装事件处理
3. 使用 `useMemo` 缓存计算值
4. 实现虚拟滚动处理大数据列表