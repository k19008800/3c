import { BarChart3, Cpu, Users, TrendingUp, Download } from 'lucide-react'
import { StatsTab } from './types'

const STATS_TABS: { key: StatsTab; label: string; icon: any }[] = [
  { key: 'overview', label: '概览', icon: BarChart3 },
  { key: 'models', label: '按模型', icon: Cpu },
  { key: 'users', label: '按用户', icon: Users },
  { key: 'trends', label: '趋势', icon: TrendingUp },
]

interface TabNavigationProps {
  tab: StatsTab
  period: string
  onTabChange: (tab: StatsTab) => void
  onExport: (exportPeriod: string, dataType: string) => void
}

export default function TabNavigation({ tab, period, onTabChange, onExport }: TabNavigationProps) {
  const tabLabel = tab === 'overview' ? '概览' : tab === 'models' ? '模型' : tab === 'users' ? '用户' : '趋势'

  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {STATS_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => onTabChange(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
              tab === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>
      <button
        onClick={() => onExport(period, tab)}
        className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
      >
        <Download size={12} /> 导出{tabLabel}
      </button>
    </div>
  )
}