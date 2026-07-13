# 3cloud 前端页面开发规范

## 文件大小限制

| 层级 | 上限 | 说明 |
|------|------|------|
| 页面组件 | **500 行** | 超过即拆分 |
| 弹窗/Dialog | **200 行** | 独立文件 |
| 表格组件 | **300 行** | 独立文件 |
| 服务/Hook | **200 行** | 单一职责 |

## 页面目录结构

```
pages/admin/users/
├── index.tsx          # 主页面 (≤300行) — 路由、Tab切换、状态协调
├── UserTable.tsx      # 用户列表表格 (≤300行)
├── UserDetail.tsx     # 用户详情弹窗 (≤200行)
├── UserFilters.tsx    # 筛选条件组件 (≤100行)
└── types.ts           # 页面专用类型
```

## 标准页面模板

```tsx
// ── 1. React & Router ──
import { useState, useEffect, useCallback } from 'react'

// ── 2. API & Hooks ──
import { get, post } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'

// ── 3. 内部组件 ──
import FeatureDescription from '@/components/admin/FeatureDescription'
import PaginationBar from '@/components/ui/PaginationBar'

// ── 4. 图标 ──
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

// ── 5. 类型 ──
import type { SomeType } from '@/types'

// ── 6. 本地子组件 ──
import { SubComponent } from './SubComponent'
import type { PageProps } from './types'
```

## 必须遵守

1. **h1 标题**: 始终用 `className="text-2xl font-bold text-slate-900"`
2. **FeatureDescription**: 每个管理页面必须有 `<FeatureDescription page="admin/xxx" className="ml-2" />`
3. **错误横幅**: `bg-red-50 text-red-600 rounded-lg` + `<AlertCircle size={16} />`
4. **成功横幅**: `bg-green-50 text-green-700 rounded-lg` + `<CheckCircle2 size={16} />`
5. **加载态**: `<Loader2 className="animate-spin" size={32} />` 居中
6. **空状态**: `py-12 text-center text-slate-400 text-sm`
7. **容器**: 顶层 `className="space-y-6"`

## 优先拆分清单

| 文件 | 当前行数 | 目标 | 优先级 |
|------|---------|------|--------|
| RedemptionCodes.tsx | 4486 | 主文件300 + 6个子组件 | **最高** |
| Users.tsx | 1806 | 主文件300 + 4个子组件 | 高 |
| VendorModels.tsx | 1210 | 主文件300 + 3个子组件 | 中 |
| VendorSelfMgmt.tsx | 1032 | 主文件300 + 3个子组件 | 中 |
| Roles.tsx | 925 | 主文件300 + Modal独立 | 低 |

## 后端优先拆分清单

| 文件 | 当前行数 | 目标 |
|------|---------|------|
| finance/codes.ts | 1463 | 拆为 batches/codes/export |
| finance.ts | 1305 | 已部分拆分，继续 |
| agent-finance.ts | 1144 | 拆为 dashboard/reconciliation/rollup/export |
| agent-core.ts | 1065 | 拆为 crud/clients/commissions |
