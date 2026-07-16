# 01 — 页面状态持久化引擎

> **后端**: — | **前端**: 2 人天 | **依赖**: 无

---

## 1. 背景与目标

**问题**：当前所有管理页面每次进入时筛选条件、时间范围、分页信息全部重置。用户每翻一页、切换筛选都要重新选择，操作链路冗长。

**目标**：搜索/筛选条件 → URL 参数持久化；列配置/时间偏好 → localStorage 持久化；页面间导航保持状态不丢失。

---

## 2. 设计概述

采用双层持久化策略：
```
URL Query Params（可分享、可刷新、可后退）
  └── 搜索关键词、筛选状态、页码、时间范围
localStorage（跨会话保持）
  └── 表格列显隐/顺序/宽度、每页条数、时间范围偏好
```

---

## 3. 核心 Hook 设计

### `usePersistedFilters(storageKey, defaults)`

```typescript
// 文件：web/src/hooks/use-persisted-filters.ts

interface PersistedFiltersOptions<T extends Record<string, any>> {
  /** localStorage key，每个页面唯一 */
  storageKey: string
  /** 默认值 */
  defaults: T
  /** 哪些字段写入 URL（默认全部） */
  urlParams?: (keyof T)[]
  /** 持久化到 localStorage（默认 true） */
  persist?: boolean
}

function usePersistedFilters<T extends Record<string, any>>(
  options: PersistedFiltersOptions<T>
): {
  filters: T                        // 当前值（合并 URL + localStorage + defaults）
  setFilter: (key: keyof T, value: any) => void
  setFilters: (partial: Partial<T>) => void
  resetFilters: () => void
  hasActiveFilters: boolean         // 是否有非空筛选条件
}
```

**优先级合并逻辑**：
```
URL 参数 > localStorage > defaults
```

**setFilter 副作用**：
1. 更新 React state
2. URL searchParams 同步（使用 `history.replaceState`，不触发导航）
3. localStorage 同步写回

---

### `usePersistedTable(key)`

```typescript
interface TableConfig {
  columns: { key: string; visible: boolean; width: number; order: number }[]
  pageSize: number
}

function usePersistedTable(storageKey: string): {
  config: TableConfig
  setColumnVisible: (key: string, visible: boolean) => void
  setColumnWidth: (key: string, width: number) => void
  reorderColumns: (fromIndex: number, toIndex: number) => void
  setPageSize: (size: number) => void
  resetColumns: () => void
}
```

---

## 4. 前端组件改造

### 筛选栏统一组件 `FilterBar`

```tsx
// 文件：web/src/components/ui/FilterBar.tsx

interface FilterBarProps {
  /** 自动从 usePersistedFilters 传入 */
  filters: Record<string, any>
  setFilter: (key: string, value: any) => void
  resetFilters: () => void
  /** 筛选配置 */
  fields: FilterField[]
  /** 是否有活跃筛选 */  
  hasActiveFilters: boolean
}

interface FilterField {
  key: string
  label: string
  type: 'text' | 'select' | 'date' | 'dateRange' | 'number'
  options?: { value: string; label: string }[]  // for select
  placeholder?: string
}
```

### 接入方式（以 vendor 列表为例）

```tsx
// pages/admin/Vendors.tsx — 改造前
const [keyword, setKeyword] = useState('')
const [statusFilter, setStatusFilter] = useState('')
const [page, setPage] = useState(1)
const [pageSize, setPageSize] = useState(20)

// 改造后
const { filters, setFilter, resetFilters } = usePersistedFilters({
  storageKey: 'admin-vendors',
  defaults: { keyword: '', status: '', page: 1, pageSize: 20 },
})

// FilterBar 替代手动拼写的筛选栏
<FilterBar
  filters={filters}
  setFilter={setFilter}
  resetFilters={resetFilters}
  hasActiveFilters={!!(filters.keyword || filters.status)}
  fields={[
    { key: 'keyword', label: '搜索', type: 'text', placeholder: '厂商名称/地址' },
    { key: 'status', label: '状态', type: 'select', options: statusOptions },
  ]}
/>
```

---

## 5. 需要改造的页面清单

| 页面 | storageKey | filters |
|------|-----------|---------|
| 供应商管理 | admin-vendors | keyword, status, page, pageSize |
| 模型管理 | admin-models | keyword, vendorId, status, page, pageSize |
| 用户管理 | admin-users | keyword, status, role, page, pageSize |
| 调用日志 | admin-logs | keyword, status, model, vendor, timeRange, page, pageSize |
| 审计日志 | admin-audit-logs | action, targetType, timeRange, page, pageSize |
| 操作日志 | admin-operation-logs | action, operator, timeRange, page, pageSize |
| API Key 管理 | admin-api-keys | keyword, status, userId, page, pageSize |
| 限流管理 | admin-rate-limits | keyword, type, page, pageSize |
| 充值订单 | admin-recharge-orders | status, timeRange, page, pageSize |
| 安全事件 | admin-security-events | type, level, timeRange, page, pageSize |
| 佣金结算 | admin-commissions | status, agentId, timeRange, page, pageSize |
| 提现管理 | admin-withdraws | status, timeRange, page, pageSize |
| 兑换码 | admin-redemption | keyword, status, page, pageSize |
| 公告管理 | admin-announcements | keyword, status, page, pageSize |
| 用户端调用日志 | user-logs | status, model, timeRange, page, pageSize |
| 用户端 API Key | user-api-keys | keyword, status, page, pageSize |
| 用户端统计 | user-stats | timeRange |

---

## 6. 边界与异常处理

| 场景 | 处理方式 |
|------|---------|
| URL 参数包含非法值（page=-1）| 兜底到 defaults |
| localStorage 被清空 | 首次访问自动从 defaults 重建 |
| 用户手动修改 URL | 解析后合并，非法值忽略 |
| 同一页面多个实例（多 tab）| 各自独立，localStorage 最后写入者胜出 |
| 大量列配置数据 | localStorage 单条不超过 10KB，超长裁剪 |

---

## 7. 验收标准

- [ ] 筛选条件后刷新页面/后退 → 条件保留
- [ ] 筛选条件复制 URL 发给他人 → 打开后条件一致
- [ ] 切换页面后返回上一页面 → 条件保留（用 BrowserRouter 的 state）
- [ ] 清除筛选 → 回到默认状态
- [ ] 调整列宽/显隐 → 刷新后保持
- [ ] 上述对 17 个页面全部生效
