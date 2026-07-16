import { useState, useCallback, useRef } from 'react'

/**
 * Unified search hook:
 * - Triggers search only on Enter or explicit call
 * - Clears and resets immediately when input becomes empty
 * - Returns raw input state (for controlled input) + committed keyword (for API call)
 */
export function useSearch() {
  const [input, setInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = useCallback((value: string) => {
    setInput(value)
    if (!value) {
      setKeyword('') // cleared → reset immediately
    }
  }, [])

  const commitSearch = useCallback(() => {
    setKeyword(input)
  }, [input])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        commitSearch()
      }
    },
    [commitSearch]
  )

  const clearSearch = useCallback(() => {
    setInput('')
    setKeyword('')
  }, [])

  return {
    /** value for the input element */
    input,
    /** committed keyword for API params */
    keyword,
    /** ref to pass to input for focus management */
    inputRef,
    /** handler for input onChange */
    handleChange,
    /** handler for input onKeyDown */
    handleKeyDown,
    /** explicit commit (for search button) */
    commitSearch,
    /** clear both input and keyword */
    clearSearch,
  }
}
