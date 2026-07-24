import { useState, useCallback } from 'react'
import { get, patch, post } from '@/lib/api'
import type { PromptAuditItem, PromptAuditDetail, AuditStats, AuditAction } from '../types'

export function usePromptAudit() {
  const [logs, setLogs] = useState<PromptAuditItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<AuditStats | null>(null)

  const loadLogs = useCallback(async (params: {
    page: number
    pageSize: number
    userId?: string
    apiKeyId?: string
    modelName?: string
    auditStatus?: string
    isSensitive?: string
    startDate?: string
    endDate?: string
  }) => {
    setLoading(true)
    setError(null)
    try {
      const [logsRes, statsRes] = await Promise.all([
        get<{ items: PromptAuditItem[]; total: number }>('/api/v1/admin/prompt-audit', params),
        get<AuditStats>('/api/v1/admin/prompt-audit/stats'),
      ])
      setLogs(logsRes.items || [])
      setTotal(logsRes.total || 0)
      setStats(statsRes)
    } catch (err: any) {
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDetail = useCallback(async (id: number): Promise<PromptAuditDetail | null> => {
    try {
      return await get<PromptAuditDetail>(`/api/v1/admin/prompt-audit/${id}`)
    } catch (err: any) {
      console.error('Load detail failed:', err)
      return null
    }
  }, [])

  const audit = useCallback(async (id: number, action: AuditAction, flagReason?: string): Promise<boolean> => {
    try {
      await patch(`/api/v1/admin/prompt-audit/${id}/audit`, {
        action,
        flagReason: action === 'flagged' ? flagReason : undefined,
      })
      // Update local state
      setLogs((prev) =>
        prev.map((log) =>
          log.id === id
            ? { ...log, auditStatus: action, auditedAt: new Date().toISOString() }
            : log
        )
      )
      return true
    } catch (err: any) {
      console.error('Audit failed:', err)
      return false
    }
  }, [])

  const analyzePrompt = useCallback(async (prompt: string): Promise<string[] | null> => {
    try {
      const res = await post<{ sensitiveWords: string[] }>('/api/v1/admin/prompt-audit/analyze', {
        prompt,
      })
      return res.sensitiveWords || []
    } catch (err: any) {
      console.error('Analyze failed:', err)
      return null
    }
  }, [])

  return {
    logs,
    total,
    loading,
    error,
    stats,
    loadLogs,
    loadDetail,
    audit,
    analyzePrompt,
  }
}