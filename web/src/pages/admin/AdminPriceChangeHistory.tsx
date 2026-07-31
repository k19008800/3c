import { useState, useEffect, useCallback } from 'react'
import {
  Search, RefreshCw, Filter, TrendingUp, TrendingDown, ArrowUpDown,
  DollarSign, Clock, User, FileText,
} from 'lucide-react'
import { Loader2, AlertCircle } from 'lucide-react'
import { get } from '@/lib/api'

interface PriceChangeRecord {
  id: number
  modelName: string
  action: string
  oldValue: string | null
  newValue: string | null
  reason: string | null
  operator: string
  createdAt: string
}

interface PriceChangeHistory {
  list: PriceChangeRecord[]
  total: number
  page: number
  pageSize: number
}

const ACTION_LABELS: Record<string, string> = {
  create: '创建',
  update: '更新',
  increase: '涨价',
  decrease: '降价',
  delete: '删除',
}
const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-900/30 text-green-400 border-green-800',
  update: 'bg-blue-900/30 text-blue-400 border-blue-800',
  increase: 'bg-red-900/30 text-red-400 border-red-800',
  decrease: 'bg-green-900/30 text-green-400 border-green-800',
  delete: 'bg-gray-900/30 text-gray-400 border-gray-700',
}

export default function AdminPriceChangeHistory() {
  const [data, setData] = useState<PriceChangeHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [searchType, setSearchType] = useState('')
  const [searchId, setSearchId] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' })
      if (searchType) params.set('targetType', searchType)
      if (searchId) params.set('targetId', searchId)
      const res = await get<PriceChangeHistory>(`/api/v1/admin/prices/history?${params}`)
      setData(res)
    } catch (err: any) {
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [page, searchType, searchId])

  useEffect(() => { fetchData() }, [fetchData])

  // 格式化时间
  function fmtTime(iso: string) {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  }

  // 格式化价格
  function fmtPrice(v: string | null) {
    if (!v) return '—'
    const n = parseFloat(v)
    if (n >= 100) return `¥${n.toFixed(2)}`
    if (n >= 1) return `¥${n.toFixed(4)}`
    return `¥${n.toFixed(6)}`
  }

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">
            模型价格变更历史 <span className="text-xs text-gray-500 align-top">[?]</span>
          </h1>
          <p className="text-sm text-gray-400 mt-1">查看所有模型/供应商价格变更记录，追溯价格调整操作</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm"
        >
          <RefreshCw className="w-4 h-4" /> 刷新
        </button>
      </div>

      {/* 搜索栏 */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">筛选：</span>
          </div>
          <select
            value={searchType}
            onChange={e => { setSearchType(e.target.value); setPage(1) }}
            className="bg-gray-700 border border-gray-600 text-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">全部类型</option>
            <option value="vendor_model">供应商模型</option>
            <option value="key_group">密钥组</option>
            <option value="model">全局模型</option>
          </select>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">目标ID：</span>
            <input
              type="number"
              value={searchId}
              onChange={e => { setSearchId(e.target.value); setPage(1) }}
              placeholder="输入模型ID"
              className="bg-gray-700 border border-gray-600 text-gray-300 rounded-lg px-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-red-600 bg-red-900/20 p-4 rounded-lg border border-red-800">
          <AlertCircle size={16} />
          <span className="text-sm">{error}</span>
          <button onClick={fetchData} className="ml-auto text-xs text-blue-400 hover:underline">重试</button>
        </div>
      ) : !data || data.list.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>暂无价格变更记录</p>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="text-left px-4 py-3 font-medium">时间</th>
                <th className="text-left px-4 py-3 font-medium">模型</th>
                <th className="text-left px-4 py-3 font-medium">操作</th>
                <th className="text-right px-4 py-3 font-medium">原价格</th>
                <th className="text-right px-4 py-3 font-medium">新价格</th>
                <th className="text-left px-4 py-3 font-medium">原因</th>
                <th className="text-left px-4 py-3 font-medium">操作人</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {data.list.map(record => (
                <tr key={record.id} className="hover:bg-gray-750">
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {fmtTime(record.createdAt)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-200 font-medium">{record.modelName}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${ACTION_COLORS[record.action] || 'bg-gray-700 text-gray-300'}`}>
                      {ACTION_LABELS[record.action] || record.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400">{fmtPrice(record.oldValue)}</td>
                  <td className="px-4 py-3 text-right">
                    {record.action === 'increase' ? (
                      <span className="text-red-400 font-medium">{fmtPrice(record.newValue)} <TrendingUp className="w-3 h-3 inline" /></span>
                    ) : record.action === 'decrease' ? (
                      <span className="text-green-400 font-medium">{fmtPrice(record.newValue)} <TrendingDown className="w-3 h-3 inline" /></span>
                    ) : (
                      <span className="text-gray-200">{fmtPrice(record.newValue)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400 max-w-[200px] truncate">{record.reason || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-gray-400">
                      <User className="w-3.5 h-3.5" />
                      {record.operator}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 分页 */}
          {data && data.total > data.pageSize && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700 text-sm text-gray-400">
              <span>共 {data.total} 条记录</span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1 bg-gray-700 rounded text-xs disabled:opacity-40 hover:bg-gray-600"
                >
                  上一页
                </button>
                <span className="text-xs">{page} / {Math.ceil(data.total / data.pageSize)}</span>
                <button
                  disabled={page >= Math.ceil(data.total / data.pageSize)}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1 bg-gray-700 rounded text-xs disabled:opacity-40 hover:bg-gray-600"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}