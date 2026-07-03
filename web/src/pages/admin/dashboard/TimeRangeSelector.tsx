import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

interface Props {
  days: number
  onChange: (days: number) => void
  onRefresh: () => void
  loading?: boolean
}

export default function TimeRangeSelector({ days, onChange, onRefresh, loading }: Props) {
  const tabs = [
    { label: '今天', value: 1 },
    { label: '近7天', value: 7 },
    { label: '近30天', value: 30 },
    { label: '自定义', value: 0 },
  ]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-5 py-3 flex items-center gap-4 flex-wrap">
      <span className="text-xs text-slate-500 font-medium">📅 时间：</span>
      <div className="flex gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => tab.value > 0 && onChange(tab.value)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              days === tab.value
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            } ${tab.value === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1" />
      <button
        onClick={onRefresh}
        disabled={loading}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-600 transition"
      >
        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        {loading ? '加载中...' : '刷新数据'}
      </button>
    </div>
  )
}
