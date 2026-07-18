import { useEffect, useState, useRef } from 'react'
import {
  Loader2, Search, X, Building2, Mail, Wallet, Clock, Download, RefreshCw,
  TrendingUp, ChevronDown, Activity,
} from 'lucide-react'
import { get } from '@/lib/api'
import {
  type EnterpriseUser, type DaySeries, type ModelBreakdown,
  type FinanceData, type ActivityData,
  STATUS_OPTIONS, TABS, fmt,
} from './types'
import { StatusBadge } from './AnalysisOverview'
import { UsageTrendSection, AnalysisTab } from './UsageTrend'
import BillingDashboard from './BillingDashboard'
import ModelDistribution from './ModelDistribution'
import ActivityRecord from './ActivityRecord'

/* ════════════════════════════════════════
   TabBar
   ════════════════════════════════════════ */
function TabBar({
  activeTab, onTabChange,
}: {
  activeTab: string
  onTabChange: (tab: string) => void
}) {
  return (
    <div className="flex border-b border-slate-200">
      {TABS.map(tab => (
        <button key={tab.key} onClick={() => onTabChange(tab.key)}
          className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium border-b-2 transition ${
            activeTab === tab.key
              ? 'text-blue-600 border-blue-500'
              : 'text-slate-500 border-transparent hover:text-slate-700 hover:border-slate-300'
          }`}>
          {tab.key === 'analysis' && <Activity size={15} />}
          {tab.key === 'models' && <Building2 size={15} />}
          {tab.key === 'finance' && <Wallet size={15} />}
          {tab.key === 'activity' && <TrendingUp size={15} />}
          {tab.label}
        </button>
      ))}
    </div>
  )
}

/* ════════════════════════════════════════
   EnterpriseDetailPanel
   ════════════════════════════════════════ */
interface DetailPanelProps {
  selected: EnterpriseUser
  trends: DaySeries[] | null
  loadingTrend: boolean
  trendDimension: string
  daysRange: number
  chartData: { date: string; calls: number; tokens: number; cost: number; successRate: number; newUsers: number }[]
  summary: { totalCalls: number; totalTokens: number; totalCost: number; avgSuccessRate: number; avgDailyCost: number }
  momChange: string | null
  modelBreakdown: ModelBreakdown[]
  loadingModels: boolean
  finance: FinanceData | null
  loadingFinance: boolean
  activity: ActivityData | null
  loadingActivity: boolean
  activeTab: string
  statusPieData: { name: string; value: number; color: string }[]
  onDimensionChange: (key: string) => void
  onDaysChange: (days: number) => void
  onTabChange: (tab: string) => void
  onExportCSV: () => void
  onRefresh: () => void
  onClear: () => void
}

function EnterpriseDetailPanel({
  selected, trends, loadingTrend, trendDimension, daysRange,
  chartData, summary, momChange, modelBreakdown, loadingModels,
  finance, loadingFinance, activity, loadingActivity,
  activeTab, statusPieData,
  onDimensionChange, onDaysChange, onTabChange, onExportCSV, onRefresh, onClear,
}: DetailPanelProps) {
  return (
    <div className="space-y-4">
      {/* 企业信息卡片 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
              <Building2 size={22} className="text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-slate-900">
                  {selected.companyName || '未设置公司名'}
                </h2>
                {selected.status && <StatusBadge status={selected.status} />}
              </div>
              <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                <span className="flex items-center gap-1">
                  <Mail size={13} /> {selected.email}
                </span>
                <span className="flex items-center gap-1">
                  <Wallet size={13} /> 余额 <strong className="text-emerald-600">¥{fmt(selected.balance)}</strong>
                </span>
                {selected.lastLoginAt && (
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <Clock size={12} />
                    最近活跃 {new Date(selected.lastLoginAt).toLocaleString('zh-CN', {
                      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onExportCSV} disabled={!trends || trends.length === 0}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition disabled:opacity-40">
              <Download size={13} /> 导出 CSV
            </button>
            <button onClick={onRefresh} disabled={loadingTrend}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition">
              <RefreshCw size={13} className={loadingTrend ? 'animate-spin' : ''} /> 刷新
            </button>
            <button onClick={onClear}
              className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded hover:bg-slate-100 transition">
              更换企业
            </button>
          </div>
        </div>
      </div>

      {/* 趋势图 + 统计卡片 */}
      <UsageTrendSection
        trends={trends}
        loadingTrend={loadingTrend}
        trendDimension={trendDimension}
        daysRange={daysRange}
        selectedName={selected.companyName || selected.email}
        chartData={chartData}
        summary={summary}
        momChange={momChange}
        modelBreakdown={modelBreakdown}
        loadingModels={loadingModels}
        onDimensionChange={onDimensionChange}
        onDaysChange={onDaysChange}
        onExportCSV={onExportCSV}
      />

      {/* Tab 切换 */}
      <TabBar activeTab={activeTab} onTabChange={onTabChange} />

      {/* Tab 内容 */}
      {activeTab === 'analysis' && (
        <AnalysisTab
          trends={trends}
          statusPieData={statusPieData}
          onExportCSV={onExportCSV}
        />
      )}
      {activeTab === 'models' && (
        <ModelDistribution modelBreakdown={modelBreakdown} loadingModels={loadingModels} />
      )}
      {activeTab === 'finance' && (
        <BillingDashboard finance={finance} loadingFinance={loadingFinance} daysRange={daysRange} />
      )}
      {activeTab === 'activity' && (
        <ActivityRecord
          activity={activity}
          loadingActivity={loadingActivity}
          daysRange={daysRange}
          modelBreakdown={modelBreakdown}
        />
      )}
    </div>
  )
}

/* ════════════════════════════════════════
   EnterpriseSearch — 搜索 + 下拉建议
   ════════════════════════════════════════ */
interface SearchProps {
  query: string
  suggestions: EnterpriseUser[]
  showSuggestions: boolean
  searching: boolean
  statusFilter: string
  showStatusMenu: boolean
  onQueryChange: (val: string) => void
  onSelect: (user: EnterpriseUser) => void
  onClear: () => void
  onStatusFilterChange: (val: string) => void
  onToggleStatusMenu: () => void
  onCloseStatusMenu: () => void
  onShowSuggestions?: (val: boolean) => void
}

export function EnterpriseSearch({
  query, suggestions, showSuggestions, searching, statusFilter, showStatusMenu,
  onQueryChange, onSelect, onClear, onStatusFilterChange, onToggleStatusMenu, onCloseStatusMenu, onShowSuggestions,
}: SearchProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const closeRef = useRef(onCloseStatusMenu)
  closeRef.current = onCloseStatusMenu

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        closeRef.current()
      }
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        closeRef.current()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="flex items-start gap-3">
      <div ref={wrapperRef} className="relative flex-1 max-w-xl">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input ref={inputRef} type="text" value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => { if (suggestions.length > 0) onShowSuggestions?.(true) }}
            placeholder="搜索企业名称或邮箱..."
            className="w-full pl-9 pr-10 py-2.5 text-sm rounded-xl border border-slate-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
          {query && (
            <button onClick={onClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
              <X size={16} />
            </button>
          )}
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-20 mt-1 w-full bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
            {suggestions.map(u => (
              <button key={u.id} onClick={() => onSelect(u)}
                className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-slate-50 border-b border-slate-100 last:border-0 transition">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Building2 size={14} className="text-blue-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800 truncate">
                    {u.companyName || u.nickname || u.email}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">{u.email}</div>
                  <div className="mt-1">{u.status && <StatusBadge status={u.status} />}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs font-semibold text-emerald-600">¥{fmt(u.balance)}</div>
                  <div className="text-[10px] text-slate-400">余额</div>
                </div>
              </button>
            ))}
          </div>
        )}
        {showSuggestions && query && !searching && suggestions.length === 0 && (
          <div className="absolute z-20 mt-1 w-full bg-white rounded-xl shadow-lg border border-slate-200 p-4 text-center text-sm text-slate-400">
            未找到匹配的企业
          </div>
        )}
        {searching && (
          <div className="absolute z-20 mt-1 w-full bg-white rounded-xl shadow-lg border border-slate-200 p-4 text-center text-sm text-slate-400">
            <Loader2 className="inline animate-spin mr-2" size={14} />搜索中...
          </div>
        )}
      </div>

      <div ref={statusRef} className="relative">
        <button onClick={onToggleStatusMenu}
          className="flex items-center gap-1.5 px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white shadow-sm hover:bg-slate-50 transition text-slate-600">
          {STATUS_OPTIONS.find(o => o.value === statusFilter)?.label || '状态'}
          <ChevronDown size={14} />
        </button>
        {showStatusMenu && (
          <div className="absolute right-0 z-20 mt-1 w-28 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
            {STATUS_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => { onStatusFilterChange(opt.value) }}
                className={`w-full px-3 py-2 text-sm text-left hover:bg-slate-50 transition ${
                  statusFilter === opt.value ? 'text-blue-600 bg-blue-50 font-medium' : 'text-slate-600'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export { EnterpriseDetailPanel as DetailPanel }
export default EnterpriseDetailPanel
