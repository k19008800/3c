import { useState, useCallback, useRef } from 'react'

export function useColumnPrefs(tableKey: string) {
  const [visible, setVisible] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`cols_${tableKey}`)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  const visibleRef = useRef(visible)
  visibleRef.current = visible

  const persist = useCallback((v: Record<string, boolean>) => {
    try {
      localStorage.setItem(`cols_${tableKey}`, JSON.stringify(v))
    } catch { /* ok */ }
  }, [tableKey])

  const toggleColumn = useCallback((col: string) => {
    const prev = visibleRef.current
    const next = { ...prev, [col]: !(prev[col] ?? true) }
    setVisible(next)
    persist(next)
  }, [persist])

  const isVisible = useCallback((col: string) => visible[col] ?? true, [visible])

  const showColumn = useCallback((col: string, show: boolean) => {
    const prev = visibleRef.current
    const next = { ...prev, [col]: show }
    setVisible(next)
    persist(next)
  }, [persist])

  const resetColumns = useCallback(() => {
    try {
      localStorage.removeItem(`cols_${tableKey}`)
    } catch { /* ok */ }
    setVisible({})
  }, [tableKey])

  return { visible, toggleColumn, isVisible, showColumn, resetColumns }
}
