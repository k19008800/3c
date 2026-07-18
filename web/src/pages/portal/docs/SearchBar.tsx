import { useCallback, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

interface SearchBarProps {
  value: string
  onChange: (query: string) => void
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value)
    },
    [onChange],
  )

  const handleClear = useCallback(() => {
    onChange('')
    inputRef.current?.focus()
  }, [onChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onChange('')
      inputRef.current?.blur()
    }
  }, [onChange])

  return (
    <div
      className={`relative flex items-center rounded-lg border transition-colors ${
        focused
          ? 'border-blue-400 ring-2 ring-blue-100'
          : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <Search size={16} className="absolute left-3 text-slate-400 pointer-events-none shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="搜索文档..."
        className="w-full pl-9 pr-8 py-2 text-sm bg-transparent text-slate-800 placeholder-slate-400 outline-none"
        aria-label="搜索文档"
      />
      {value && (
        <button
          onClick={handleClear}
          className="absolute right-2 text-slate-400 hover:text-slate-600 transition-colors p-0.5"
          aria-label="清除搜索"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
