import { useState, useCallback } from 'react'
import { get, post, patch, del } from '@/lib/api'
import type { SensitiveWord, WordForm } from '../types'

export function useSensitiveWords() {
  const [words, setWords] = useState<SensitiveWord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadWords = useCallback(async (params: {
    page: number
    pageSize: number
    keyword?: string
    category?: string
    severity?: string
    enabled?: string
  }) => {
    setLoading(true)
    setError(null)
    try {
      const res = await get<{ items: SensitiveWord[]; total: number }>(
        '/api/v1/admin/sensitive-words',
        params
      )
      setWords(res.items || [])
      setTotal(res.total || 0)
    } catch (err: any) {
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const createWord = useCallback(async (form: WordForm): Promise<SensitiveWord | null> => {
    try {
      const res = await post<SensitiveWord>('/api/v1/admin/sensitive-words', form)
      return res
    } catch (err: any) {
      setError(err.message || '创建失败')
      return null
    }
  }, [])

  const updateWord = useCallback(async (id: number, form: Partial<WordForm>): Promise<boolean> => {
    try {
      await patch(`/api/v1/admin/sensitive-words/${id}`, form)
      return true
    } catch (err: any) {
      setError(err.message || '更新失败')
      return false
    }
  }, [])

  const deleteWord = useCallback(async (id: number): Promise<boolean> => {
    try {
      await del(`/api/v1/admin/sensitive-words/${id}`)
      return true
    } catch (err: any) {
      setError(err.message || '删除失败')
      return false
    }
  }, [])

  const batchImport = useCallback(async (words: string[], category: string, severity: string): Promise<number> => {
    try {
      const res = await post<{ count: number }>('/api/v1/admin/sensitive-words/batch', {
        words,
        category,
        severity,
      })
      return res.count || 0
    } catch (err: any) {
      setError(err.message || '批量导入失败')
      return 0
    }
  }, [])

  return {
    words,
    total,
    loading,
    error,
    loadWords,
    createWord,
    updateWord,
    deleteWord,
    batchImport,
  }
}