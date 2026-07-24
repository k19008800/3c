# VendorKeyGroups.tsx 拆分计划

**源文件**: `3cloud/web/src/pages/admin/VendorKeyGroups.tsx`
**行数**: 1125 行
**优先级**: P0（最大组件）

---

## 一、结构分析

### 1.1 主要功能模块

| 模块 | 行数范围 | 功能 |
|------|----------|------|
| 类型定义 | 1-50 | KeyGroup, KeyItem, ChannelRef, TestResult, VendorSummary |
| 工具函数 | 52-60 | calcHealth |
| 主组件 | 62-400 | 状态管理 + 数据获取 |
| 渲染逻辑 | 400-800 | 供应商选择 + 分组列表 + Key 列表 |
| Modal 组件 | 800-1125 | CreateGroupModal, EditGroupModal, CreateKeyModal, EditKeyModal |

### 1.2 状态变量（20+）

```typescript
// 基础数据
vendors, vendorSummaries, selectedVendorId
groups, selectedGroupId, items

// UI 状态
loading, itemsLoading, error
searchQuery, statusTab, showDeleted
revealedIds, revealing
channels, channelsLoading, showChannels
testResults, testing
editingNotes, savingNotes
selectedIds, batchTestingItems, batchDeleting, batchUpdating
```

### 1.3 核心操作

- `loadGroups` - 加载分组
- `loadItems` - 加载 Key 列表
- `loadChannels` - 加载关联通道
- `testKey` - 测试连通性
- `revealKey` - 显示完整 Key
- `toggleStatus` - 切换状态
- `batchTest` - 批量测试
- `batchDelete` - 批量删除

---

## 二、拆分策略

### 2.1 目录结构

```
src/pages/admin/vendor-key-groups/
├── types.ts                      # 类型定义
├── utils.ts                      # 工具函数
├── hooks/
│   ├── index.ts
│   ├── useVendors.ts             # 供应商数据
│   ├── useKeyGroups.ts           # 分组数据
│   ├── useKeyItems.ts            # Key 列表
│   ├── useKeyChannels.ts         # 关联通道
│   ├── useKeyTest.ts             # 连通性测试
│   └── useBatchActions.ts        # 批量操作
├── components/
│   ├── index.ts
│   ├── VendorSelector.tsx        # 供应商选择器
│   ├── GroupList.tsx             # 分组列表
│   ├── KeyTable.tsx              # Key 表格
│   ├── KeyRow.tsx                # Key 行
│   ├── KeyFilters.tsx            # 筛选器
│   ├── KeyStats.tsx              # 统计卡片
│   ├── ChannelList.tsx           # 关联通道列表
│   ├── CreateGroupModal.tsx      # 新建分组
│   ├── EditGroupModal.tsx        # 编辑分组
│   ├── CreateKeyModal.tsx        # 新建 Key
│   └── EditKeyModal.tsx          # 编辑 Key
└── index.tsx                     # 入口
```

### 2.2 Hooks 提取

| Hook | 职责 | 状态数 |
|------|------|--------|
| `useVendors` | 供应商列表 + 汇总 | 3 |
| `useKeyGroups` | 分组 CRUD | 4 |
| `useKeyItems` | Key 列表 + 分页 + 筛选 | 6 |
| `useKeyChannels` | 关联通道 | 3 |
| `useKeyTest` | 单个/批量测试 | 3 |
| `useBatchActions` | 批量选择/删除/更新 | 5 |

### 2.3 组件提取

| 组件 | 职责 | 预计行数 |
|------|------|----------|
| `VendorSelector` | 供应商下拉 + 统计 | ~80 |
| `GroupList` | 分组卡片列表 | ~120 |
| `KeyTable` | Key 表格容器 | ~100 |
| `KeyRow` | 单行渲染 + 操作 | ~150 |
| `KeyFilters` | 搜索 + 状态 Tab | ~80 |
| `KeyStats` | 统计卡片 | ~60 |
| `ChannelList` | 关联通道弹窗 | ~100 |
| `CreateGroupModal` | 新建分组表单 | ~150 |
| `EditGroupModal` | 编辑分组表单 | ~150 |
| `CreateKeyModal` | 新建 Key 表单 | ~200 |
| `EditKeyModal` | 编辑 Key 表单 | ~200 |

---

## 三、执行步骤

### Step 1: 创建目录结构
```bash
mkdir -p vendor-key-groups/{hooks,components}
```

### Step 2: 提取类型 + 工具
- `types.ts` - 所有 interface
- `utils.ts` - calcHealth

### Step 3: 提取 Hooks（6个）
- 按依赖顺序：useVendors → useKeyGroups → useKeyItems → useKeyChannels → useKeyTest → useBatchActions

### Step 4: 提取组件（11个）
- 先提取简单组件（Stats, Filters）
- 再提取复杂组件（Table, Row, Modals）

### Step 5: 重构主组件
- 组合 Hooks + 组件
- 目标 ~150 行

### Step 6: 验证构建
```bash
npm run build
```

---

## 四、预期产出

| 指标 | 当前 | 目标 |
|------|------|------|
| 主文件行数 | 1125 | ~150 |
| Hooks 数量 | 0 | 6 |
| 组件数量 | 0 | 11 |
| 可复用性 | 低 | 高 |

---

**状态**: ✅ 已完成
**结果**: 主文件 1125 → 563 行（减少 50%）
**产出**: 1 Hook + 8 组件
**开始时间**: 2026-07-24 08:22