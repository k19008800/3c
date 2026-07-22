# 3cloud 前端状态管理测试报告

> 测试时间：2026-07-22
> 测试范围：闭包陷阱、状态持久化、分页筛选、测试盲区

---

## 一、闭包陷阱检查

### 🔴 P0 问题：`use-persisted-filters.ts` setFilter 闭包陷阱

**位置**：`src/hooks/use-persisted-filters.ts` L140-144

**问题代码**：
```typescript
const setFilter = useCallback((key: keyof T, value: FilterValue) => {
  const next = { ...filters, [key]: value } as T
  persist(next)
}, [filters, persist])  // ← filters 依赖导致闭包陷阱
```

**问题分析**：
- `filters` 是 `useMemo` 计算值，依赖 `searchParams`
- `setSearchParams` 是异步的，连续调用 `setFilter` 时，第二次拿到的 `filters` 可能是旧值
- **后果**：连续修改两个筛选条件时，第二个条件会覆盖第一个条件

**修复方案**：
```typescript
// 方案 A：函数式更新（推荐）
const setFilter = useCallback((key: keyof T, value: FilterValue) => {
  setSearchParams(prev => {
    const params = new URLSearchParams(prev)
    // ... 更新逻辑
    return params
  })
}, [setSearchParams, /* 其他依赖 */])

// 方案 B：使用 ref 追踪最新值
const filtersRef = useRef(filters)
useEffect(() => { filtersRef.current = filters }, [filters])

const setFilter = useCallback((key: keyof T, value: FilterValue) => {
  const next = { ...filtersRef.current, [key]: value } as T
  persist(next)
}, [persist])
```

**影响页面**：所有使用 `usePersistedFilters` 的页面（17+）

---

### 🟡 P1 问题：FilterBar select 字段重复调用

**位置**：`src/components/ui/FilterBar.tsx` L100-103

**问题代码**：
```typescript
onChange={(e) => {
  setFilter(field.key, e.target.value)
  onFilterChange?.()  // ← 可能包含 setFilter('page', 1)
}}
```

**问题分析**：
- `onFilterChange` 通常包含 `setFilter('page', 1)`
- 导致一次操作触发两次 `setFilter` 调用
- **后果**：在闭包陷阱存在时，第二次调用会覆盖第一次的值

**修复方案**：
```typescript
// 方案 A：合并调用
onChange={(e) => {
  const value = e.target.value
  if (onFilterChange) {
    // 让父组件统一处理
    onFilterChange({ [field.key]: value })
  } else {
    setFilter(field.key, value)
  }
}}

// 方案 B：移除 onFilterChange，让 setFilter 自动触发页码重置
// 在 use-persisted-filters 中增加自动重置逻辑
```

**影响页面**：所有使用 `FilterBar` 且传入 `onFilterChange` 的页面

---

## 二、状态持久化验证

### ✅ 三层持久化架构正确

**架构**：
1. URL searchParams（最高优先级）— 分享/刷新/后退可用
2. localStorage — 同机器跨会话
3. 服务端 /preferences API — 跨设备跨浏览器

**验证结果**：
- ✅ 无直接操作 `window.location.search` 的代码
- ✅ 无直接操作 `history.pushState/replaceState` 的代码
- ✅ localStorage 写入统一在 `use-persisted-filters.ts` 中
- ✅ URL 参数写入使用 `setSearchParams(params, { replace: true })`，不会产生历史记录

**潜在问题**：
- 🟡 `VendorSelfMgmt.tsx` 直接操作 `localStorage.setItem('vendor_demo_key')`，但这是独立场景，不影响筛选状态

---

## 三、分页/筛选组件专项

### 🟡 P1 问题：重复页码重置

**位置**：多个页面

**问题代码示例**：
```typescript
// Vendors.tsx L225
onPageSizeChange={(s) => setFilters({ pageSize: s, page: 1 })}
```

**问题分析**：
- `use-pagination.ts` 的 `onPageSizeChange` 已经包含 `setPage(1)`
- 但页面又调用 `setFilters({ page: 1 })`
- **后果**：冗余调用，在闭包陷阱存在时可能导致状态不一致

**修复方案**：
```typescript
// 方案 A：移除页面中的 page: 1 重置（推荐）
onPageSizeChange={(s) => setFilters({ pageSize: s })}

// 方案 B：在 use-persisted-filters 中增加智能重置
const setFilters = useCallback((partial: Partial<T>) => {
  const next = { ...filters, ...partial } as T
  // 如果修改了 pageSize 但没有显式设置 page，自动重置
  if ('pageSize' in partial && !('page' in partial)) {
    next.page = 1
  }
  persist(next)
}, [filters, persist])
```

**影响页面**：
- Vendors.tsx
- Users.tsx
- AdminLogs.tsx
- Announcements.tsx
- AuditLogs.tsx
- Campaigns.tsx
- OperationLogs.tsx
- RealNameReview.tsx
- RechargeOrders.tsx
- SecurityEvents.tsx
- VendorModels.tsx
- Withdraws.tsx

---

### ✅ 分页组件设计正确

**验证结果**：
- ✅ `PaginationBar` 的 `onPageSizeChange` 只调用一次
- ✅ `use-pagination.ts` 的 `onPageSizeChange` 包含 `setPage(1)`
- ✅ 页码跳转逻辑正确（边界检查、输入验证）

---

## 四、测试覆盖盲区清单

### 🔴 缺失的测试场景

| 场景 | 测试方法 | 预期结果 |
|------|----------|----------|
| 连续修改筛选条件 | 修改状态 → 再修改角色 | 两个条件同时生效 |
| 连续修改 pageSize | 改为 50 → 再改为 100 | pageSize=100，page=1 |
| 搜索 → 清空 → 再搜索 | 输入关键词 → 清空 → 输入新关键词 | 每次搜索后 page=1 |
| 翻页 → 修改筛选 → 翻页 | 翻到第 2 页 → 修改状态 → 翻页 | 修改筛选后自动回到第 1 页 |
| 刷新页面 | 修改筛选 → 刷新页面 | 筛选条件保留（URL 参数） |
| 浏览器后退/前进 | 修改筛选 → 后退 → 前进 | 筛选条件正确恢复 |
| 空列表分页 | 筛选结果为空 | 显示"暂无数据"，分页显示 0/0 页 |
| 总条数刚好是 pageSize 整数倍 | 总数=100，pageSize=20 | 显示 5 页，无多余页 |
| 跳转到超出范围的页码 | 总共 5 页，跳转到第 10 页 | 自动修正为第 5 页 |

---

## 五、修复优先级

| 优先级 | 问题 | 影响 | 修复成本 |
|--------|------|------|----------|
| P0 | setFilter 闭包陷阱 | 所有筛选页面 | 中（需重构 setFilter） |
| P1 | FilterBar 重复调用 | select 类型筛选字段 | 低（移除 onFilterChange） |
| P1 | 重复页码重置 | 分页组件 | 低（移除冗余调用） |
| P2 | 测试覆盖盲区 | 质量保障 | 中（补充测试用例） |

---

## 六、修复方案总结

### 1. 修复 setFilter 闭包陷阱（P0）

**文件**：`src/hooks/use-persisted-filters.ts`

**修改**：
```typescript
// Before
const setFilter = useCallback((key: keyof T, value: FilterValue) => {
  const next = { ...filters, [key]: value } as T
  persist(next)
}, [filters, persist])

// After（函数式更新）
const setFilter = useCallback((key: keyof T, value: FilterValue) => {
  // 使用 setSearchParams 的函数形式，确保拿到最新值
  setSearchParams(prev => {
    const currentFilters = { ...defaults }
    
    // 从 localStorage 读取
    try {
      const local = localStorage.getItem(`filters_${storageKey}`)
      if (local) {
        Object.assign(currentFilters, JSON.parse(local))
      }
    } catch {}
    
    // 从 URL 读取
    for (const k of urlKeys) {
      const val = prev.get(k as string)
      if (val !== null) {
        const dv = defaults[k]
        if (typeof dv === 'number') currentFilters[k] = Number(val)
        else if (typeof dv === 'boolean') currentFilters[k] = val === 'true'
        else currentFilters[k] = val
      }
    }
    
    // 应用新值
    currentFilters[key] = value
    
    // 写回 localStorage
    try {
      localStorage.setItem(`filters_${storageKey}`, JSON.stringify(currentFilters))
    } catch {}
    
    // 写回 URL
    const params = new URLSearchParams()
    for (const k of urlKeys) {
      const val = currentFilters[k]
      if (val !== undefined && val !== null && val !== '' && val !== defaults[k] && val !== 0 && val !== false) {
        params.set(k as string, String(val))
      }
    }
    
    return params
  })
}, [defaults, urlKeys, storageKey, setSearchParams])
```

### 2. 移除 FilterBar onFilterChange（P1）

**文件**：`src/components/ui/FilterBar.tsx`

**修改**：
```typescript
// Before
onChange={(e) => {
  setFilter(field.key, e.target.value)
  onFilterChange?.()
}}

// After（移除 onFilterChange 调用）
onChange={(e) => {
  setFilter(field.key, e.target.value)
}}
```

**同步修改**：所有使用 `FilterBar` 的页面，移除 `onFilterChange` prop

### 3. 移除重复页码重置（P1）

**文件**：所有使用 `onPageSizeChange` 的页面

**修改**：
```typescript
// Before
onPageSizeChange={(s) => setFilters({ pageSize: s, page: 1 })}

// After（移除 page: 1）
onPageSizeChange={(s) => setFilters({ pageSize: s })}
```

**同步修改**：在 `use-persisted-filters.ts` 的 `setFilters` 中增加智能重置：
```typescript
const setFilters = useCallback((partial: Partial<T>) => {
  const next = { ...filters, ...partial } as T
  // 如果修改了 pageSize 但没有显式设置 page，自动重置
  if ('pageSize' in partial && !('page' in partial)) {
    next.page = 1
  }
  persist(next)
}, [filters, persist])
```

---

## 七、测试用例补充

### 1. 闭包陷阱测试

```typescript
// __tests__/use-persisted-filters.test.ts
describe('usePersistedFilters - 闭包陷阱', () => {
  it('连续调用 setFilter 应正确合并值', async () => {
    const { result } = renderHook(() => usePersistedFilters({
      storageKey: 'test',
      defaults: { a: '', b: '', page: 1 },
    }))
    
    // 连续调用
    act(() => {
      result.current.setFilter('a', 'value1')
      result.current.setFilter('b', 'value2')
    })
    
    await waitFor(() => {
      expect(result.current.filters.a).toBe('value1')
      expect(result.current.filters.b).toBe('value2')
    })
  })
})
```

### 2. 分页重置测试

```typescript
// __tests__/use-persisted-filters.test.ts
describe('usePersistedFilters - 分页重置', () => {
  it('修改 pageSize 应自动重置 page', async () => {
    const { result } = renderHook(() => usePersistedFilters({
      storageKey: 'test',
      defaults: { page: 1, pageSize: 20 },
    }))
    
    // 先翻到第 2 页
    act(() => {
      result.current.setFilter('page', 2)
    })
    
    // 修改 pageSize
    act(() => {
      result.current.setFilters({ pageSize: 50 })
    })
    
    await waitFor(() => {
      expect(result.current.filters.page).toBe(1)
      expect(result.current.filters.pageSize).toBe(50)
    })
  })
})
```

### 3. 状态持久化测试

```typescript
// __tests__/use-persisted-filters.test.ts
describe('usePersistedFilters - 状态持久化', () => {
  it('刷新页面后应恢复筛选条件', async () => {
    // 设置 URL 参数
    window.history.pushState({}, '', '?keyword=test&page=2')
    
    const { result } = renderHook(() => usePersistedFilters({
      storageKey: 'test',
      defaults: { keyword: '', page: 1, pageSize: 20 },
    }))
    
    await waitFor(() => {
      expect(result.current.filters.keyword).toBe('test')
      expect(result.current.filters.page).toBe(2)
    })
  })
})
```

---

## 八、执行计划

1. **Phase 1（P0）**：修复 `use-persisted-filters.ts` setFilter 闭包陷阱
2. **Phase 2（P1）**：移除 FilterBar onFilterChange 调用
3. **Phase 3（P1）**：移除页面中重复的 page: 1 重置
4. **Phase 4（P2）**：补充测试用例
5. **Phase 5**：全量回归测试（50 页面）

---

## 九、验收标准

- [ ] 连续修改两个筛选条件，两个条件同时生效
- [ ] 连续修改 pageSize 两次，最终值正确
- [ ] 修改筛选条件后，page 自动重置为 1
- [ ] 刷新页面后，筛选条件保留
- [ ] 浏览器后退/前进，筛选条件正确恢复
- [ ] 所有 50 页面功能正常
