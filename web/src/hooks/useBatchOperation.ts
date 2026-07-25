import { useState, useCallback } from 'react'
import { post } from '@/lib/api'

export type BatchActionType = 'disable' | 'enable' | 'balance' | 'level' | 'export'

interface BatchResult {
  success: number
  failed: number
  errors?: Array<{ userId: number; reason: string }>
}

interface UseBatchOperationReturn {
  loading: boolean
  error: string | null
  result: BatchResult | null
  execute: (
    action: BatchActionType,
    userIds: number[],
    params?: {
      reason?: string
      disabledUntil?: string
      amount?: number
      description?: string
      level?: number
    }
  ) => Promise<BatchResult | null>
  reset: () => void
}

export function useBatchOperation(): UseBatchOperationReturn {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BatchResult | null>(null)

  const execute = useCallback(async (
    action: BatchActionType,
    userIds: number[],
    params?: {
      reason?: string
      disabledUntil?: string
      amount?: number
      description?: string
      level?: number
    }
  ): Promise<BatchResult | null> => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      let endpoint = ''
      let body: any = { userIds }

      switch (action) {
        case 'disable':
          endpoint = '/api/v1/admin/users/batch/disable'
          body.reason = params?.reason
          body.disabledUntil = params?.disabledUntil
          break
        case 'enable':
          endpoint = '/api/v1/admin/users/batch/enable'
          break
        case 'balance':
          endpoint = '/api/v1/admin/users/batch/balance'
          body.amount = params?.amount
          body.description = params?.description
          break
        case 'level':
          endpoint = '/api/v1/admin/users/batch/level'
          body.level = params?.level
          body.reason = params?.reason
          break
        case 'export':
          endpoint = '/api/v1/admin/users/batch/export'
          // 导出直接下载
          const res = await fetch('/api/v1/admin/users/batch/export', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
            },
            body: JSON.stringify({ userIds }),
          })
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `users_export_${Date.now()}.csv`
          a.click()
          URL.revokeObjectURL(url)
          setLoading(false)
          return { success: userIds.length, failed: 0 }
      }

      const data = await post<BatchResult>(endpoint, body)
      setResult(data)
      return data
    } catch (err: any) {
      const errorMsg = err.message || '操作失败'
      setError(errorMsg)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setLoading(false)
    setError(null)
    setResult(null)
  }, [])

  return {
    loading,
    error,
    result,
    execute,
    reset,
  }
}

export default useBatchOperation