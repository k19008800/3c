import { useState } from 'react'
import {
  Search, Key, ArrowUpDown, Clock, Eye, EyeOff,
} from 'lucide-react'
import type { ApiKey } from '@/types'

const STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'timeout', label: '超时' },
  { value: 'cancelled', label: '已取消' },
  { value: 'pending', label: '处理中' },
] as const

interface LogsFilterProps {
  modelName: string
  setModelName: (value: string) => void
  statusFilter: string
  setStatusFilter: (value: string) => void
  startDate: string
  setStartDate: (value: string) => void
  endDate: string
  setEndDate: (value: string) => void
  apiKeyId: number | ''
  setApiKeyId: (value: number | '') => void
  sortOrder: 'desc' | 'asc'
  setSortOrder: (value: 'desc' | 'asc') => void
  apiKeys: ApiKey[]
  updateFilter: (key: string, value: any) => void
  resetFilters: () => void
  showColumnMenu: boolean
  setShowColumnMenu: (value: boolean) => void
  isVisible: (key: string) => boolean
  toggleColumn: (key: string) => void
}

const COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'createdAt', label: '时间' },
  { key: 'modelName', label: '模型' },
  { key: 'vendorName', label: '供应商' },
  { key: 'promptTokens', label: 'Prompt' },
  { key: 'completionTokens', label: 'Completion' },
  { key: 'totalTokens', label: 'Token' },
  { key: 'cost', label: '消费' },
  { key: 'status', label: '状态' },
  { key: 'durationMs', label: '耗时' },
  { key: 'isStreaming', label: '模式' },
  { key: 'errorMessage', label: '错误信息' },
] as const

export default function LogsFilter({
  modelName,
  setModelName,
  statusFilter,
  setStatusFilter,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  apiKeyId,
  setApiKeyId,
  sortOrder,
  setSortOrder,
  apiKeys,
  updateFilter,
  resetFilters,
  showColumnMenu,
  setShowColumnMenu,
  isVisible,
  toggleColumn,
}: LogsFilterProps) {
  const changeFilter = (key: string, value: any, setter: (v: any) => void) => {
    setter(value)
    updateFilter(key, value)
  }

  return (
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
              setSortOrder(next)
              updateFilter('sortOrder', next)
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
  )
}