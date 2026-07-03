import { useState, useCallback, useRef } from 'react'

export function useSearchHistory(storageKey: string) {
  const [history, setHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`search_${storageKey}`)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  const historyRef = useRef(history)
  historyRef.current = history

  const persist = useCallback((h: string[]) => {
    try {
      localStorage.setItem(`search_${storageKey}`, JSON.stringify(h))
    } catch { /* ok */ }
  }, [storageKey])

  const addSearch = useCallback((term: string) => {
    if (!term.trim()) return
    const prev = historyRef.current
    const next = [term, ...prev.filter(h => h !== term)].slice(0, 5)
    setHistory(next)
    persist(next)
  }, [persist])

  const removeSearch = useCallback((term: string) => {
    const prev = historyRef.current
    const next = prev.filter(h => h !== term)
    setHistory(next)
    persist(next)
  }, [persist])

  const clearHistory = useCallback(() => {
    try {
      localStorage.removeItem(`search_${storageKey}`)
    } catch { /* ok */ }
    setHistory([])
  }, [storageKey])

  return { history, addSearch, removeSearch, clearHistory }
}
