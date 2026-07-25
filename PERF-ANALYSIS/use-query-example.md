# use-query.ts 使用示例

## 基本用法

### 1. 简单的 API 请求

```tsx
import { useApiQuery } from '@/hooks/use-query'

function UserProfile() {
  const { data, isLoading, error, refetch } = useApiQuery(
    '/api/v1/users/me',
    {
      headers: { 'Authorization': `Bearer ${token}` }
    },
    {
      staleTime: 30000, // 30秒后重新验证
      retry: 3,
      onSuccess: (data) => console.log('User data loaded:', data),
      onError: (error) => console.error('Failed to load user:', error)
    }
  )

  if (isLoading) return <div>加载中...</div>
  if (error) return <div>错误: {error.message}</div>
  
  return (
    <div>
      <h1>{data.name}</h1>
      <p>{data.email}</p>
      <button onClick={() => refetch()}>刷新</button>
    </div>
  )
}
```

### 2. 自定义 fetcher 函数

```tsx
import { useQuery } from '@/hooks/use-query'

function LogsList() {
  const fetchLogs = async () => {
    const response = await fetch('/api/v1/logs', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (!response.ok) throw new Error('Failed to fetch logs')
    return response.json()
  }

  const { 
    data, 
    isLoading, 
    isFetching, 
    error,
    refetch,
    cancel 
  } = useQuery(
    'logs-list', // 缓存键
    fetchLogs,
    {
      staleTime: 60000, // 1分钟
      cacheTime: 300000, // 5分钟
      enabled: true // 自动加载
    }
  )

  return (
    <div>
      {isLoading && <div>首次加载...</div>}
      {isFetching && <div>刷新中...</div>}
      {error && <div>错误: {error.message}</div>}
      {data && (
        <ul>
          {data.map(log => (
            <li key={log.id}>{log.message}</li>
          ))}
        </ul>
      )}
      <button onClick={() => refetch()}>刷新</button>
      <button onClick={cancel}>取消</button>
    </div>
  )
}
```

## 高级用法

### 3. 乐观更新

```tsx
import { useOptimisticMutation } from '@/hooks/use-query'

function UpdateUserName() {
  const [name, setName] = useState('')
  
  const updateUser = async (newName: string) => {
    const response = await fetch('/api/v1/users/name', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name: newName })
    })
    if (!response.ok) throw new Error('更新失败')
    return response.json()
  }

  const { mutate, isLoading, error } = useOptimisticMutation(
    updateUser,
    {
      onMutate: (newName) => {
        // 乐观更新前的操作
        console.log('正在更新名称:', newName)
        return { previousName: name }
      },
      onSuccess: (data, newName, context) => {
        console.log('更新成功:', data)
        // 可以在这里更新本地状态或缓存
      },
      onError: (error, newName, context) => {
        console.error('更新失败:', error)
        // 可以在这里回滚乐观更新
        setName(context.previousName)
      }
    }
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutate(name)
  }

  return (
    <form onSubmit={handleSubmit}>
      <input 
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="输入新名称"
      />
      <button type="submit" disabled={isLoading}>
        {isLoading ? '更新中...' : '更新'}
      </button>
      {error && <div style={{ color: 'red' }}>{error.message}</div>}
    </form>
  )
}
```

### 4. 批量查询

```tsx
import { useQueries } from '@/hooks/use-query'

function Dashboard() {
  const queries = useQueries({
    userStats: {
      key: 'user-stats',
      fetcher: async () => {
        const res = await fetch('/api/v1/stats/users')
        return res.json()
      }
    },
    revenueStats: {
      key: 'revenue-stats',
      fetcher: async () => {
        const res = await fetch('/api/v1/stats/revenue')
        return res.json()
      }
    },
    systemStatus: {
      key: 'system-status',
      fetcher: async () => {
        const res = await fetch('/api/v1/health')
        return res.json()
      },
      options: {
        staleTime: 10000, // 10秒
        retry: 1
      }
    }
  })

  if (queries.isLoading) return <div>加载仪表板...</div>

  return (
    <div className="dashboard">
      <div className="stats-card">
        <h3>用户统计</h3>
        {queries.userStats.data && (
          <div>
            <p>总用户: {queries.userStats.data.total}</p>
            <p>今日新增: {queries.userStats.data.today}</p>
          </div>
        )}
      </div>
      
      <div className="stats-card">
        <h3>收入统计</h3>
        {queries.revenueStats.data && (
          <div>
            <p>总收入: ¥{queries.revenueStats.data.total}</p>
            <p>今日收入: ¥{queries.revenueStats.data.today}</p>
          </div>
        )}
      </div>
      
      <div className="stats-card">
        <h3>系统状态</h3>
        {queries.systemStatus.data && (
          <div>
            <p>状态: {queries.systemStatus.data.status}</p>
            <p>响应时间: {queries.systemStatus.data.responseTime}ms</p>
          </div>
        )}
      </div>
      
      <button onClick={queries.refetchAll}>刷新所有数据</button>
    </div>
  )
}
```

### 5. 缓存管理

```tsx
import { queryCache, useApiQuery } from '@/hooks/use-query'

function CacheDemo() {
  const { data } = useApiQuery('/api/v1/data', {}, { staleTime: 60000 })

  const updateCacheManually = () => {
    // 手动更新缓存
    queryCache.set('api:/api/v1/data', {
      ...data,
      updatedAt: new Date().toISOString()
    }, 120000) // 2分钟过期
    
    // 或者触发重新验证
    // queryCache.delete('api:/api/v1/data')
  }

  const clearAllCache = () => {
    queryCache.clear()
    alert('所有缓存已清除')
  }

  return (
    <div>
      <h1>缓存管理示例</h1>
      <div>数据: {JSON.stringify(data)}</div>
      <button onClick={updateCacheManually}>手动更新缓存</button>
      <button onClick={clearAllCache}>清除所有缓存</button>
    </div>
  )
}
```

## 迁移指南

### 从原生 fetch 迁移

**之前：**
```tsx
const [data, setData] = useState(null)
const [loading, setLoading] = useState(true)
const [error, setError] = useState(null)

useEffect(() => {
  let isCancelled = false
  
  const fetchData = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/v1/data')
      const result = await response.json()
      if (!isCancelled) {
        setData(result)
        setError(null)
      }
    } catch (err) {
      if (!isCancelled) {
        setError(err)
      }
    } finally {
      if (!isCancelled) {
        setLoading(false)
      }
    }
  }
  
  fetchData()
  
  return () => {
    isCancelled = true
  }
}, [])
```

**之后：**
```tsx
const { data, isLoading, error, refetch } = useApiQuery(
  '/api/v1/data',
  {},
  {
    staleTime:的文件里突然了 30000,
    retry: 2
  }
)
```

### 从多个独立请求迁移

**之前：**
```tsx
const [user, setUser] = useState(null)
const [posts, setPosts] = useState([])
const [comments, setComments] = useState([])

useEffect(() => {
  Promise.all([
    fetch('/api/v1/user').then(r => r.json()),
    fetch('/api/v1/posts').then(r => r.json()),
    fetch('/api/v1/comments').then(r => r.json())
  ]).then(([userData, postsData, commentsData]) => {
    setUser(userData)
    setPosts(postsData)
    setComments(commentsData)
  })
}, [])
```

**之后：**
```tsx
const queries = useQueries({
  user: {
    key: 'user-data',
    fetcher: () => fetch('/api/v1/user').then(r => r.json())
  },
  posts: {
    key: 'posts-data',
    fetcher: () => fetch('/api/v1/posts').then(r => r.json())
  },
  comments: {
    key: 'comments-data',
    fetcher: () => fetch('/api/v1/comments').then(r => r.json())
  }
})
```

## 最佳实践

### 1. 缓存键命名
```tsx
// 好：包含参数信息
const key = `user-${userId}-posts-${page}`
const key = `logs-${startDate}-${endDate}`

// 不好：过于简单，可能导致缓存冲突
const key = 'data'
const key = 'list'
```

### 2. 缓存时间设置
```tsx
// 根据数据类型设置不同的缓存时间
const configs = {
  // 频繁变化的数据：短缓存
  notifications: { staleTime: 10000, cacheTime: 30000 },
  
  // 不经常变化的数据：长缓存  
  userProfile: { staleTime: 300000, cacheTime: 1800000 },
  
  // 实时数据：不缓存或极短缓存
  liveStats: { staleTime:的道观古树中 1000, cacheTime: 5000 },
  
  // 静态数据：长缓存
  config: { staleTime: 3600000, cacheTime: 86400000 }
}
```

### 3. 错误处理
```tsx
const { data, error, isLoading } = useApiQuery(
  '/api/v1/data',
  {},
  {
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
    onError: (error) => {
      // 记录错误到监控系统
      captureException(error)
      // 显示用户友好的错误信息
      showToast(`加载失败: ${error.message}`)
    }
  }
)
```

### 4. 性能优化
```tsx
// 使用 enabled 控制请求时机
const { data } = useApiQuery(
  '/api/v1/user/details',
  {},
  {
    enabled: !!userId, // 只有 userId 存在时才发起请求
    staleTime: 60000
  }
)

// 延迟加载
const { data } = useApiQuery(
  '/api/v1/heavy-data',
  {},
  {
    enabled: shouldLoadData, // 用户交互后才加载
    staleTime: 300000
  }
)
```

## 故障排除

### 常见问题

1. **缓存不更新**
   - 检查缓存键是否唯一
   - 确认 `staleTime` 设置是否合理
   - 使用 `refetch(true)` 强制刷新

2. **内存泄漏**
   - 确保组件卸载时调用 `cancel()`
   - 定期清理过期缓存
   - 避免在循环中创建大量缓存键

3. **请求重复**
   - 检查是否有多个组件使用相同的缓存键
   - 确认 `pendingRequests` 去重机制正常工作
   - 使用 `useQueries` 批量处理相关请求

### 调试工具

```tsx
// 添加调试日志
const { data } = useApiQuery(
  '/api/v1/data',
  {},
  {
    onSuccess: (data) => console.log('Query成功:', data),
    onError: (error) => console.error('Query失败:', error),
    onSettled: (data, error) => console.log('Query完成:', { data, error })
  }
)

// 检查缓存状态
console.log('缓存大小:', globalCache.size)
console.log('待处理请求:', pendingRequests.size)
```

---

*最后更新：2026-07-24*  
*文档版本：v1.0.0*