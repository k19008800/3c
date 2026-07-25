// 快速测试 use-query.ts 的 TypeScript 编译
import { useQuery, useApiQuery, useOptimisticMutation, useQueries, queryCache } from './use-query'

// 1. 测试基本类型
interface User {
  id: number
  name: string
  email: string
}

// 2. useQuery 测试
const TestComponent1 = () => {
  const { data, isLoading, error } = useQuery<User>(
    'user-123',
    async () => {
      const response = await fetch('/api/v1/users/123')
      return response.json()
    },
    {
      staleTime: 30000,
      retry: 3
    }
  )
  
  return null
}

// 3. useApiQuery 测试
const TestComponent2 = () => {
  const { data, refetch } = useApiQuery<User>(
    '/api/v1/users/me',
    {
      headers: { 'Authorization': 'Bearer token' }
    },
    {
      staleTime: 60000
    }
  )
  
  return null
}

// 4. useOptimisticMutation 测试
const TestComponent3 = () => {
  const { mutate, isLoading } = useOptimisticMutation(
    async (name: string) => {
      const response = await fetch('/api/v1/users/name', {
        method: 'PUT',
        body: JSON.stringify({ name })
      })
      return response.json()
    }
  )
  
  return null
}

// 5. useQueries 测试
const TestComponent4 = () => {
  const queries = useQueries({
    user: {
      key: 'user-data',
      fetcher: async () => {
        const response = await fetch('/api/v1/user')
        return response.json()
      }
    },
    posts: {
      key: 'posts-data',
      fetcher: async () => {
        const response = await fetch('/api/v1/posts')
        return response.json()
      }
    }
  })
  
  return null
}

// 6. queryCache 测试
const testCache = () => {
  // 设置缓存
  queryCache.set<User>('user-123', { id: 123, name: 'Test', email: 'test@example.com' })
  
  // 获取缓存
  const user = queryCache.get<User>('user-123')
  
  // 检查缓存
  const hasCache = queryCache.has('user-123')
  
  // 删除缓存
  queryCache.delete('user-123')
  
  // 清空缓存
  queryCache.clear()
}

console.log('TypeScript 类型检查通过')