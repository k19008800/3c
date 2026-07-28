# 06 — 加载性能优化

> **后端**: 1 人天 | **前端**: 1.5 人天 | **依赖**: 无

---

## 1. 背景与目标

**问题**：
- Admin Dashboard 首屏 6 个并行 API，Chrome 同域并发限制导致排队
- 列表页 1000+ 行数据 DOM 渲染卡顿
- 切换页面时白屏等待
- 无骨架屏，用户感知"空白加载中"

**目标**：首屏加载 < 1.5s、列表 1000 行流畅滚动、页面切换有骨架屏过渡。

---

## 2. 后端优化

### 2.1 聚合端点

| 当前 | 优化后 |
|------|--------|
| Dashboard: 6 个并行 GET | 2 个聚合端点 (`/summary` + `/charts`) |
| 列表页: 数据 + 统计分开请求 | 合并到分页响应中返回聚合信息 |

### 2.2 Redis 缓存热点数据

```typescript
// api/src/services/dashboards/cache.ts

const DASHBOARD_CACHE_TTL = 30_000  // 30 秒

async function getDashboardCached(key: string, fetcher: () => Promise<any>) {
  const redis = getRedis()
  const cached = await redis.get(`dashboard:${key}`)
  if (cached) return JSON.parse(cached)
  
  const data = await fetcher()
  await redis.setex(`dashboard:${key}`, DASHBOARD_CACHE_TTL / 1000, JSON.stringify(data))
  return data
}

// 使用示例（原有 fetch 函数外包一层）
const summary = await getDashboardCached('summary', fetchDashboardSummary)
```

缓存策略：

| 缓存键 | TTL | 说明 |
|--------|-----|------|
| `dashboard:summary` | 30s | 顶部聚合统计（在线通道、今日消耗等）|
| `dashboard:trends:{days}` | 60s | 趋势数据（变化不频繁）|
| `dashboard:health` | 30s | 厂商健康状态 |
| `admin:stats:overview` | 60s | 管理后台统计概览 |
| `user:dashboard:{userId}` | 30s | 用户仪表盘数据 |

### 2.3 分页查询优化

- 当前使用 `OFFSET + LIMIT` → 大页码时性能下降
- 改为 `keyset pagination`（游标分页）用于大数据量表（call_logs, audit_logs）
- 在 `call_logs` 表增加 `(userId, created_at)` 复合索引

```typescript
// 游标分页实现
// 文件：api/src/services/pagination.ts（扩展）

interface CursorPaginationParams {
  after?: string    // 游标（上一页最后一条的 id）
  before?: string
  limit: number
  orderBy: 'asc' | 'desc'
}

interface CursorPage<T> {
  data: T[]
  nextCursor: string | null
  prevCursor: string | null
  hasMore: boolean
  total?: number    // 仅第一页返回，后续页不计算
}
```

---

## 3. 前端优化

### 3.1 骨架屏扩展

```tsx
// 现有 components/ui/skeleton.tsx 增加变体

// 仪表盘骨架
<Skeleton variant="dashboard" />
// 渲染：顶部 5 个卡片骨架 + 图表骨架 + 表格骨架

// 表格骨架
<Skeleton variant="table" rows={10} />
// 渲染：10 行 x 6 列的骨架网格

// 图表骨架
<Skeleton variant="chart" />
// 渲染：300px 高的渐变条纹区域

// 详情页骨架
<Skeleton variant="detail" />
// 渲染：左侧导航 + 右侧内容区的骨架
```

### 3.2 Suspense 粒度细化

```tsx
// 当前：整个 Dashboard 组件用 lazy 包装
// 改造后：Dashboard 内部各区块独立 Suspense

function AdminDashboard() {
  return (
    <div>
      <ErrorBoundary fallback={<DashboardFallback />}>
        <Suspense fallback={<Skeleton variant="dashboard" />}>
          <SummarySection />        {/* 聚合数据，非 lazy */}
          <QuickActionsGrid />      {/* 静态组件，不 lazy */}
          <Suspense fallback={<Skeleton variant="chart" />}>
            <AnomalyAlertBar />
          </Suspense>
          <Suspense fallback={<Skeleton variant="chart" />}>
            <TrendsCharts />
          </Suspense>
        </Suspense>
      </ErrorBoundary>
    </div>
  )
}
```

### 3.3 虚拟滚动（列表页）

```bash
npm install @tanstack/react-virtual
```

```tsx
// 应用于数据量可能超过 500 行的列表页

import { useVirtualizer } from '@tanstack/react-virtual'

function VirtualTable({ data, columns, ... }) {
  const parentRef = useRef<HTMLDivElement>(null)
  
  const virtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,  // 每行 48px
    overscan: 5,             // 额外渲染 5 行
  })

  return (
    <div ref={parentRef} className="h-[600px] overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            {/* 行渲染逻辑 */}
          </div>
        ))}
      </div>
    </div>
  )
}
```

**需要虚拟滚动的页面**：

| 页面 | 典型数据量 | 适用 |
|------|-----------|------|
| 调用日志 | 1K-10K+ | ✅ 虚拟滚动 |
| 审计日志 | 1K-10K+ | ✅ 虚拟滚动 |
| 用户列表 | 100-10K | ✅ 虚拟滚动 |
| API Key 列表 | 100-5K | ✅ 虚拟滚动 |
| 操作日志 | 1K-10K+ | ✅ 虚拟滚动 |
| 财务对账明细 | 1K-5K | ✅ 虚拟滚动 |
| 其他列表 | <500 | ❌ 不需要（现有分页足够）|

### 3.4 React.memo + useMemo 优化

对频繁重渲染的组件包装：

```tsx
// 列表行组件
const VendorRow = React.memo(function VendorRow({ vendor, onToggle, ... }) {
  return (
    <tr>
      <td>{vendor.name}</td>
      <td><InlineToggle value={...} /></td>
      ...
    </tr>
  )
})

// 筛选栏
<FilterBar
  filters={useMemo(() => filters, [filters.keyword, filters.status])}
/>
```

---

## 4. 性能度量

### 4.1 埋点方案

```typescript
// 文件：web/src/lib/perf.ts

// 页面加载性能
window.addEventListener('load', () => {
  const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
  
  // 上报关键指标
  reportPerf({
    page: window.location.pathname,
    ttfb: perf.responseStart - perf.requestStart,
    fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
    domReady: perf.domContentLoadedEventEnd - perf.fetchStart,
    fullLoad: perf.loadEventEnd - perf.fetchStart,
  })
})
```

### 4.2 持续监控钩子

- 开发期：Chrome DevTools Performance Tab 记录
- 上线后：下次升级考虑接 Sentry/自建 APM

---

## 5. 验收标准

- [ ] Dashboard 首屏 < 1.5s（从点击菜单到关键数据可见）
- [ ] 列表 1000 行渲染 < 500ms（虚拟滚动）
- [ ] 页面切换无白屏，骨架屏立即显示
- [ ] Redis 缓存命中率 > 80%（dashboard 聚合数据）
- [ ] 6 个 list-heavy 页面完成虚拟滚动改造
- [ ] 首次加载后 Dashboard 手动刷新可感知加速（缓存命中）
