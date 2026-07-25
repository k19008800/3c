// ── useKeyBatchOperation — API Key 批量操作 Hook ──
// 封装批量禁用、启用、设置速率限制、绑定用户、导出等操作

import { useState, useCallback } from 'react'
import { post } from '@/lib/api'

export interface BatchOperationResult {
  success: number
  failed: number
  errors?: Array<{ keyId: number; reason: string }>
  downloadUrl?: string
}

export interface UseKeyBatchOperationOptions {
  onSuccess?: (result: BatchOperationResult, action: string) => void
  onError?: (error: Error, action: string) => void
}

export function useKeyBatchOperation(options?: UseKeyBatchOperationOptions) {
  const [loading, setLoading] = useState(false)
  const [lastResult, setLastResult] = useState<BatchOperationResult | null>(null)

  // ── 批量禁用 ──
  const batchDisable = useCallback(async (keyIds: number[], reason?: string) => {
    if (keyIds.length === 0) {
      throw new Error('请选择至少一个 Key')
    }
    if (keyIds.length > 100) {
      throw new Error('单次批量操作上限 100 个 Key')
    }

    setLoading(true)
    try {
      const data = await post<BatchOperationResult>(
        '/api/v1/admin/keys/batch/disable',
        { keyIds, reason }
      )
      setLastResult(data)
      options?.onSuccess?.(data, 'disable')
      return data
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      options?.onError?.(err, 'disable')
      throw err
    } finally {
      setLoading(false)
    }
  }, [options])

  // ── 批量启用 ──
  const batchEnable = useCallback(async (keyIds: number[]) => {
    if (keyIds.length === 0) {
      throw new Error('请选择至少一个 Key')
    }
    if (keyIds.length > 100) {
      throw new Error('单次批量操作上限 100 个 Key')
    }

    setLoading(true)
    try {
      const data = await post<BatchOperationResult>(
        '/api/v1/admin/keys/batch/enable',
        { keyIds }
      )
      setLastResult(data)
      options?.onSuccess?.(data, 'enable')
      return data
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      options?.onError?.(err, 'enable')
      throw err
    } finally {
      setLoading(false)
    }
  }, [options])

  // ── 批量设置速率限制 ──
  const batchSetRateLimit = useCallback(async (
    keyIds: number[],
    params: { requestsPerMinute?: number; tokensPerDay?: number }
  ) => {
    if (keyIds.length === 0) {
      throw new Error('请选择至少一个 Key')
    }
    if (keyIds.length > 100) {
      throw new Error('单次批量操作上限 100 个 Key')
    }
    if (params.requestsPerMinute === undefined && params.tokensPerDay === undefined) {
      throw new Error('请至少设置一个速率限制参数')
    }

    setLoading(true)
    try {
      const data = await post<BatchOperationResult>(
        '/api/v1/admin/keys/batch/rate-limit',
        { keyIds, ...params }
      )
      setLastResult(data)
      options?.onSuccess?.(data, 'rate-limit')
      return data
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      options?.onError?.(err, 'rate-limit')
      throw err
    } finally {
      setLoading(false)
    }
  }, [options])

  // ── 批量绑定用户 ──
  const batchAssignUser = useCallback(async (keyIds: number[], userId: number) => {
    if (keyIds.length === 0) {
      throw new Error('请选择至少一个 Key')
    }
    if (keyIds.length > 100) {
      throw new Error('单次批量操作上限 100 个 Key')
    }
    if (!userId) {
      throw new Error('请选择目标用户')
    }

    setLoading(true)
    try {
      const data = await post<BatchOperationResult>(
        '/api/v1/admin/keys/batch/assign-user',
        { keyIds, userId }
      )
      setLastResult(data)
      options?.onSuccess?.(data, 'assign-user')
      return data
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      options?.onError?.(err, 'assign-user')
      throw err
    } finally {
      setLoading(false)
    }
  }, [options])

  // ── 批量导出 ──
  const batchExport = useCallback(async (keyIds: number[], format: 'json' | 'csv' = 'json') => {
    if (keyIds.length === 0) {
      throw new Error('请选择至少一个 Key')
    }
    if (keyIds.length > 100) {
      throw new Error('单次批量操作上限 100 个 Key')
    }

    setLoading(true)
    try {
      const data = await post<BatchOperationResult | { keys: any[]; total: number }>(
        '/api/v1/admin/keys/batch/export',
        { keyIds, format }
      )
      
      // CSV 格式会直接下载，返回的是字符串
      if (format === 'csv') {
        options?.onSuccess?.({ success: keyIds.length, failed: 0 }, 'export')
        return data
      }

      // JSON 格式
      const result: BatchOperationResult = {
        success: 'keys' in data ? data.keys.length : 0,
        failed: 0,
      }
      setLastResult(result)
      options?.onSuccess?.(result, 'export')
      return data
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      options?.onError?.(err, 'export')
      throw err
    } finally {
      setLoading(false)
    }
  }, [options])

  return {
    loading,
    lastResult,
    batchDisable,
    batchEnable,
    batchSetRateLimit,
    batchAssignUser,
    batchExport,
  }
}
