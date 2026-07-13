import { useState, useCallback } from 'react'

/**
 * 通用表单提交 Hook
 *
 * 消除 30+ 个页面中重复的 submitting/try/catch 表单提交模式。
 *
 * @example
 * const { submit, submitting, error } = useSubmit()
 * const handleSave = () => submit(async () => {
 *   await post('/api/v1/something', body)
 *   setMsg('保存成功')
 * })
 */
export function useSubmit() {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = useCallback(async (fn: () => Promise<void>) => {
    setSubmitting(true)
    setError('')
    try {
      await fn()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '操作失败'
      setError(message)
      throw err // 让调用方也可以捕获
    } finally {
      setSubmitting(false)
    }
  }, [])

  return { submit, submitting, error }
}
