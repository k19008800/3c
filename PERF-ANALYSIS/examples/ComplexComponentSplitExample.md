# 复杂组件拆分示例

## 场景：大型数据管理组件

假设我们有一个复杂的数据管理组件 `DataManagement.tsx`，包含以下功能：
1. 数据筛选器
2. 数据表格
3. 分页控制
4. 批量操作
5. 数据统计
6. 导出功能

## 拆分前：单一组件结构

```typescript
// DataManagement.tsx (假设800行)
interface DataManagementProps {
  data: DataItem[]
  total: number
  loading: boolean
  // ... 20+ props
}

export default function DataManagement({
  data,
  total,
  loading,
  // ... props
}: DataManagementProps) {
  // 状态管理（50行）
  const [filters, setFilters] = useState({})
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  
  // 数据处理函数（100行）
  const handleFilterChange = () => { /* ... */ }
  const handleSelectAll = () => { /* ... */ }
  const handleBulkAction = () => { /* ... */ }
  const handleExport = () => { /* ... */ }
  // ... 更多函数
  
  // 渲染部分（650行）
  return (
    <div className="space-y-6">
      {/* 筛选器部分（100行） */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="text-lg font-semibold">数据筛选</h3>
        {/* 复杂的筛选表单 */}
      </div>
      
      {/* 统计卡片（80行） */}
      <div className="grid grid-cols-4 gap-4">
        {/* 多个统计卡片 */}
      </div>
      
      {/* 批量操作栏（60行） */}
      {selectedIds.length > 0 && (
        <div className="bg-blue-50 p-3 rounded">
          {/* 批量操作按钮 */}
        </div>
      )}
      
      {/* 数据表格（300行） */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          {/* 复杂表格结构 */}
        </table>
      </div>
      
      {/* 分页控制（50行） */}
      <div className="flex justify-between items-center">
        {/* 分页组件 */}
      </div>
      
      {/* 导出控制（60行） */}
      <div className="bg-gray-50 p-4 rounded">
        {/* 导出选项 */}
      </div>
    </div>
  )
}
```

## 拆分后：模块化结构

### 1. 主入口文件
```typescript
// DataManagement/index.tsx (50行)
import DataFilters from './components/DataFilters'
import DataStats from './components/DataStats'
import BulkActions from './components/BulkActions'
import DataTable from './components/DataTable'
import PaginationControl from './components/PaginationControl'
import ExportControls from './components/ExportControls'
import { useDataManagement } from './hooks/useDataManagement'

export default function DataManagement() {
  const {
    data,
    filters,
    selectedIds,
    page,
    pageSize,
    loading,
    // ... 其他状态和方法
  } = useDataManagement()
  
  return (
    <div className="space-y-6">
      <DataFilters filters={filters} onChange={handleFilterChange} />
      <DataStats data={data} />
      <BulkActions 
        selectedIds={selectedIds} 
        onAction={handleBulkAction}
      />
      <DataTable 
        data={data}
        selectedIds={selectedIds}
        onSelect={handleSelect}
        loading={loading}
      />
      <PaginationControl 
        page={page}
        pageSize={pageSize}
        total={total}
        onChange={handlePageChange}
      />
      <ExportControls onExport={handleExport} />
    </div>
  )
}
```

### 2. 组件拆分

#### DataFilters.tsx (120行)
```typescript
// 专门负责筛选功能
interface DataFiltersProps {
  filters: FilterState
  onChange: (key: string, value: any) => void
}

export default function DataFilters({ filters, onChange }: DataFiltersProps) {
  // 只包含筛选相关的逻辑
}
```

#### DataTable.tsx (180行)
```typescript
// 专门负责表格展示
interface DataTableProps {
  data: DataItem[]
  selectedIds: number[]
  onSelect: (id: number) => void
  loading: boolean
}

export default function DataTable({ data, selectedIds, onSelect, loading }: DataTableProps) {
  // 只包含表格相关的逻辑
}
```

#### BulkActions.tsx (80行)
```typescript
// 专门负责批量操作
interface BulkActionsProps {
  selectedIds: number[]
  onAction: (action: string) => void
}

export default function BulkActions({ selectedIds, onAction }: BulkActionsProps) {
  // 只包含批量操作相关的逻辑
}
```

### 3. Hook拆分

#### useDataManagement.ts (150行)
```typescript
// 数据管理的主要逻辑
export function useDataManagement() {
  const [state, setState] = useState(initialState)
  
  // 筛选逻辑
  const handleFilterChange = useCallback(() => { /* ... */ }, [])
  
  // 选择逻辑
  const handleSelect = useCallback(() => { /* ... */ }, [])
  
  // 分页逻辑
  const handlePageChange = useCallback(() => { /* ... */ }, [])
  
  // 导出逻辑
  const handleExport = useCallback(() => { /* ... */ }, [])
  
  return {
    ...state,
    handleFilterChange,
    handleSelect,
    handlePageChange,
    handleExport,
  }
}
```

#### useDataFetching.ts (100行)
```typescript
// 数据获取逻辑
export function useDataFetching(filters, page, pageSize) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  
  useEffect(() => {
    // 数据获取逻辑
  }, [filters, page, pageSize])
  
  return { data, loading }
}
```

### 4. 工具函数

#### dataUtils.ts (80行)
```typescript
// 数据处理工具函数
export function filterData(data, filters) { /* ... */ }
export function sortData(data, sortBy) { /* ... */ }
export function paginateData(data, page, pageSize) { /* ... */ }
export function exportToCSV(data) { /* ... */ }
```

### 5. 类型定义

#### types.ts (60行)
```typescript
// 类型定义
export interface DataItem {
  id: number
  name: string
  // ... 其他字段
}

export interface FilterState {
  search: string
  category: string
  dateRange: [Date, Date]
  // ... 其他筛选条件
}

export type SortDirection = 'asc' | 'desc'
```

## 拆分后的目录结构

```
DataManagement/
├── index.tsx                    # 主入口 (50行)
├── components/
│   ├── DataFilters.tsx         # 筛选组件 (120行)
│   ├── DataStats.tsx           # 统计组件 (80行)
│   ├── BulkActions.tsx         # 批量操作 (80行)
│   ├── DataTable.tsx           # 数据表格 (180行)
│   ├── PaginationControl.tsx   # 分页控制 (60行)
│   └── ExportControls.tsx      # 导出控制 (70行)
├── hooks/
│   ├── useDataManagement.ts    # 主逻辑Hook (150行)
│   ├── useDataFetching.ts      # 数据获取Hook (100行)
│   └── useDataSelection.ts     # 选择逻辑Hook (70行)
├── utils/
│   ├── dataUtils.ts            # 数据处理工具 (80行)
│   └── exportUtils.ts          # 导出工具 (60行)
├── types.ts                    # 类型定义 (60行)
└── constants.ts                # 常量定义 (40行)
```

## 拆分优势

### 1. 可维护性
- 每个文件职责单一
- 易于理解和修改
- 减少合并冲突

### 2. 可测试性
- 组件独立测试
- Hook可单独测试
- 工具函数单元测试

### 3. 可复用性
- 组件可在其他页面复用
- Hook可跨模块复用
- 工具函数通用

### 4. 团队协作
- 不同开发者可同时工作
- 清晰的代码所有权
- 降低review复杂度

### 5. 性能优化
- 组件可单独memoize
- 按需加载子组件
- 减少不必要的重渲染

## 实践建议

### 何时拆分
1. 组件超过500行
2. 包含3个以上独立功能
3. Props数量超过20个
4. 维护变得困难时

### 如何拆分
1. 识别独立的功能区块
2. 提取为子组件
3. 抽离业务逻辑到Hook
4. 整理类型和工具函数
5. 更新导入引用

### 质量控制
1. 确保类型安全
2. 保持接口兼容
3. 添加适当的测试
4. 更新文档说明