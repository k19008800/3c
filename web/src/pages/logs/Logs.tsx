import { useState } from 'react'
import LogDetailDrawer from '@/components/logs/LogDetailDrawer'
import LogStatsCards from '@/components/logs/LogStatsCards'
import LogTrendChart from '@/components/logs/LogTrendChart'
import LogModelChart from '@/components/logs/LogModelChart'
import LogExportButton from '@/components/logs/LogExportButton'
import LogAnomaliesPanel from '@/components/logs/LogAnomaliesPanel'
import PaginationBar from '@/components/ui/PaginationBar'
import {
  Loader2, AlertCircle, RefreshCw,
  Search, Key, Eye, EyeOff, ArrowUpDown, Clock, Zap,
  GitCompare,
} from 'lucide-react'
import { useColumnPrefs } from '@/hooks/use-column-prefs'
import { StatusBadge } from './components/StatusBadge'
import { LatencyBadge } from './components/LatencyBadge'
import { STATUS_OPTIONS, COLUMNS } from './constants'
import { useLogs } from './hooks/useLogs'
import { useKeyComparison } from './hooks/useKeyComparison'

export default function Logs() {
  const {
    // Data state
    logs,
    total,
    page,
    pageSize,
    loading,
    error,
    summary,
    summaryLoading,
    detailId,
    apiKeys,
    setDetailId,
    
    // Filters
    modelName,
    statusFilter,
    startDate,
    endDate,
    apiKeyId,
    sortOrder,
    autoRefresh,
    setModelName,
    setStatusFilter,
    setStartDate,
    setEndDate,
    setApiKeyId,
    setSortOrder,
    setAutoRefresh,
    
    // Error insight
    errorPatterns,
    errorInsightLoading,
    
    // Key comparison
    showComparison,
    compareKeyA,
    compareKeyB,
    comparisonDataA,
    comparisonDataB,
    setShowComparison,
    setCompareKeyA,
    setCompareKeyB,
    
    // Pagination
    totalPages,
    setPage,
    setPageSize,
    
    // Functions
    fetchLogs,
    fetchSummary,
    changeFilter,
    resetFilters,
  } = useLogs()

  const { isVisible, toggleColumn } = useColumnPrefs('logs_table')
  const { renderComparisonCard } = useKeyComparison()

  // ── Column visibility panel ──
  const [showColumnMenu, setShowColumnMenu] = useState(false)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">调用日志</h1>
        <div className="flex items-center gap-3">
          {/* Auto refresh toggle */}
          <label className="flex items-center gap-1.5 text-sm text-slate-500 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            自动刷新
          </label>
          <span className="text-sm text-slate-500">共 {total} 条记录</span>
          <LogExportButton filters={{ modelName, status: statusFilter, startDate, endDate, apiKeyId: apiKeyId || undefined }} />
          <button
            onClick={() => { fetchLogs(); fetchSummary() }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <RefreshCw size={14} />
            刷新
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <LogStatsCards summary={summary} loading={summaryLoading} />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LogTrendChart />
        <LogModelChart
          startDate={startDate || undefined}
          endDate={endDate || undefined}
        />
      </div>

      {/* Cost Anomalies Panel */}
      <LogAnomaliesPanel days={7} />

      {/* Error Insight Panel */}
      {statusFilter === 'failed' && (
        <div className="bg-white rounded-xl p-5 shadow-sm border border-red-200">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle size={20} className="text-red-500" />
            <h2 className="text-lg font-semibold text-slate-900">错误分析</h2>
          </div>
          {errorInsightLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="animate-spin" size={24} />
            </div>
          ) : errorPatterns.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">暂无错误数据可供分析</p>
          ) : (
            <div className="space-y-3">
              {errorPatterns.map((ep, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
                  <div className="w-6 h-6 rounded-full bg-red-200 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-red-700">{idx + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-red-800 truncate" title={ep.pattern}>
                        {ep.pattern}
                      </p>
                      <span className="text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                        {ep.count} 次 ({ep.percentage.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="mt-1.5 w-full h-1.5 bg-red-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-400 rounded-full transition-all"
                        style={{ width: `${Math.min(100, ep.percentage)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Key Comparison */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <GitCompare size={20} className="text-indigo-500" />
            <h2 className="text-lg font-semibold text-slate-900">API Key 对比</h2>
          </div>
          <button
            onClick={() => setShowComparison(!showComparison)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition ${
              showComparison
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                : 'border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <GitCompare size={14} />
            {showComparison ? '关闭对比' : '开启对比'}
          </button>
        </div>

        {showComparison && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Key A</label>
                <select
                  value={compareKeyA}
                  onChange={(e) => setCompareKeyA(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">选择 Key...</option>
                  {apiKeys.filter(k => k.status).map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name} ({k.keyPrefix}...)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Key B</label>
                <select
                  value={compareKeyB}
                  onChange={(e) => setCompareKeyB(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">选择 Key...</option>
                  {apiKeys.filter(k => k.status && k.id !== compareKeyA).map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name} ({k.keyPrefix}...)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-4">
              {renderComparisonCard(comparisonDataA, 'Key A')}
              <div className="flex items-center">
                <span className="text-slate-300 font-bold text-lg">VS</span>
              </div>
              {renderComparisonCard(comparisonDataB, 'Key B')}
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Model name search */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">模型名称</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={modelName}
                onChange={(e) => changeFilter('modelName', e.target.value, setModelName)}
                placeholder="搜索模型..."
                className="w-40 pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* API Key filter */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">API Key</label>
            <div className="relative">
              <Key size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                value={apiKeyId}
                onChange={(e) => changeFilter('apiKeyId', e.target.value ? Number(e.target.value) : '', setApiKeyId)}
                className="w-44 pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
              >
                <option value="">全部 Key</option>
                {apiKeys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name} ({k.keyPrefix}...)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">状态</label>
            <select
              value={statusFilter}
              onChange={(e) => changeFilter('status', e.target.value, setStatusFilter)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">开始日期</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => changeFilter('startDate', e.target.value, setStartDate)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">结束日期</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => changeFilter('endDate', e.target.value, setEndDate)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Sort order */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">排序</label>
            <button
              onClick={() => {
                const next = sortOrder === 'desc' ? 'asc' : 'desc'
                changeFilter('sortOrder', next, setSortOrder)
              }}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition"
            >
              <ArrowUpDown size={14} />
              <Clock size={12} />
              时间{sortOrder === 'desc' ? '↓' : '↑'}
            </button>
          </div>

          {/* Column visibility */}
          <div className="relative">
            <label className="block text-xs text-slate-500 mb-1">列显隐</label>
            <button
              onClick={() => setShowColumnMenu(!showColumnMenu)}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition"
            >
              <Eye size={14} />
              列
            </button>
            {showColumnMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowColumnMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-slate-200 z-20 py-1">
                  {COLUMNS.map((col) => (
                    <button
                      key={col.key}
                      onClick={() => toggleColumn(col.key)}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition"
                    >
                      {isVisible(col.key) ? (
                        <Eye size={14} className="text-blue-500" />
                      ) : (
                        <EyeOff size={14} className="text-slate-300" />
                      )}
                      {col.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            onClick={resetFilters}
            className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            重置
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                {COLUMNS.filter(col => isVisible(col.key)).map(col => (
                  <th key={col.key} className="px-4 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={COLUMNS.filter(col => isVisible(col.key)).length} className="text-center py-12">
                    <Loader2 className="animate-spin inline-block" size={24} />
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.filter(col => isVisible(col.key)).length} className="text-center py-12 text-slate-400">
                    暂无日志数据
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50 transition cursor-pointer"
                    onClick={() => setDetailId(log.id)}
                  >
                    {isVisible('id') && <td className="px-4 py-3 text-sm text-slate-400 font-mono">{log.id}</td>}
                    {isVisible('createdAt') && (
                      <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('zh-CN')}
                      </td>
                    )}
                    {isVisible('modelName') && <td className="px-4 py-3 text-sm font-medium text-slate-900">{log.modelName}</td>}
                    {isVisible('vendorName') && <td className="px-4 py-3 text-sm text-slate-600">{log.vendorName}</td>}
                    {isVisible('promptTokens') && <td className="px-4 py-3 text-sm text-slate-600 text-right">{log.promptTokens?.toLocaleString() || '-'}</td>}
                    {isVisible('completionTokens') && <td className="px-4 py-3 text-sm text-slate-600 text-right">{log.completionTokens?.toLocaleString() || '-'}</td>}
                    {isVisible('totalTokens') && <td className="px-4 py-3 text-sm text-slate-600 text-right font-medium">{log.totalTokens?.toLocaleString() || '-'}</td>}
                    {isVisible('cost') && <td className="px-4 py-3 text-sm text-slate-600 text-right">¥{Number(log.cost || 0).toFixed(6)}</td>}
                    {isVisible('status') && <td className="px-4 py-3"><StatusBadge status={log.status} /></td>}
                    {isVisible('durationMs') && (
                      <td className="px-4 py-3">
                        <LatencyBadge durationMs={log.durationMs} />
                      </td>
                    )}
                    {isVisible('isStreaming') && (
                      <td className="px-4 py-3">
                        {log.isStreaming ? (
                          <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                            <Zap size={10} />流式
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">非流式</span>
                        )}
                      </td>
                    )}
                    {isVisible('errorMessage') && (
                      <td className="px-4 py-3 text-sm text-red-500 max-w-[200px] truncate" title={log.errorMessage || ''}>
                        {log.errorMessage || '-'}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 0 && (
          <PaginationBar
            page={page}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            total={total}
            totalPages={totalPages}
          />
        )}
      </div>

      {/* Detail Drawer */}
      <LogDetailDrawer logId={detailId} onClose={() => setDetailId(null)} />
    </div>
  )
}