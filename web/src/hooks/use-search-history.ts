import { useState, useCallback } from 'react'

export function useSearchHistory(storageKey: string) {
  const [history, setHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`search_${storageKey}`)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  const addSearch = useCallback((term: string) => {
    if (!term.trim()) return
    setHistory(prev => {
      const next = [term, ...prev.filter(h => h !== term)].slice(0, 5)
      try {
        localStorage.setItem(`search_${storageKey}`, JSON.stringify(next))
      } catch { /* ok */ }
      return next
    })
  }, [storageKey])

  const removeSearch = useCallback((term: string) => {
    setHistory(prev => {
      const next = prev.filter(h => h !== term)
      try {
        localStorage.setItem(`search_${storageKey}`, JSON.stringify(next))
      } catch { /* ok */ }
      return next
    })
  }, [storageKey])

  const clearHistory = useCallback(() => {
    try {
      localStorage.removeItem(`search_${storageKey}`)
    } catch { /* ok */ }
    setHistory([])
  }, [storageKey])

  return { history, addSearch, removeSearch, clearHistory }
}
