import { useState, useCallback } from 'react'

export function useColumnPrefs(tableKey: string) {
  const [visible, setVisible] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`cols_${tableKey}`)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  const toggleColumn = useCallback((col: string) => {
    setVisible(prev => {
      const next = { ...prev, [col]: !(prev[col] ?? true) }
      try {
        localStorage.setItem(`cols_${tableKey}`, JSON.stringify(next))
      } catch { /* ok */ }
      return next
    })
  }, [tableKey])

  const isVisible = useCallback((col: string) => visible[col] ?? true, [visible])

  const showColumn = useCallback((col: string, show: boolean) => {
    setVisible(prev => {
      const next = { ...prev, [col]: show }
      try {
        localStorage.setItem(`cols_${tableKey}`, JSON.stringify(next))
      } catch { /* ok */ }
      return next
    })
  }, [tableKey])

  const resetColumns = useCallback(() => {
    try {
      localStorage.removeItem(`cols_${tableKey}`)
    } catch { /* ok */ }
    setVisible({})
  }, [tableKey])

  return { visible, toggleColumn, isVisible, showColumn, resetColumns }
}
