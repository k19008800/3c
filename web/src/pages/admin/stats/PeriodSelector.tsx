import { useCallback } from 'react'
import { PERIODS } from './types'

interface PeriodSelectorProps {
  value: string
  onChange: (value: string) => void
}

export default function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  const handleClick = useCallback((v: string) => {
    onChange(v)
  }, [onChange])

  return (
    <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
      {PERIODS.map(p => (
        <button
          key={p.value}
          onClick={() => handleClick(p.value)}
          className={`px-4 py-2 text-sm rounded-md transition ${
            value === p.value
              ? 'bg-white text-slate-900 shadow-sm font-medium'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
