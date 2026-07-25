import { useEffect, useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import {
  Loader2, AlertCircle, BarChart3, RefreshCw, Download,
  Calendar, GitBranch, Clock, Activity, Users, Globe, Wifi, Zap
} from 'lucide-react'

interface ReportTemplate {
  key: string
  name: string
  description: string
  dimension: string
  defaultDays: number
}

interface ReportDimension {
  key: string
  label: string
}

interface ReportRow {
  [key: string]: any
}

interface ReportResult {
  dimension: string
  days: number
  from: string
  to: string
  total: number
  rows: ReportRow[]
}

const dimIcons: Record<string, typeof Calendar> = {
  by_user: Users,
  by_action: Zap,
  by_date: Calendar,
  by_hour: Clock,
  by_api_key: GitBranch,
  by_ip: Globe,
  by_status: Activity,
}

const dimLabels: Record<string, string> = {
  by_user: '按用户',
  by_action: '按操作类型',
  by_date: '按日期',
  by_hour: '按小时',
  by_api_key: '按 API Key',
  by_ip: '按 IP',
  by_status: '按状态',
}

export default function AdminCustomReports() {
  const [templates, setTemplates] = useState<ReportTemplate[]>([])
  const [dimensions, setDimensions] = useState<ReportDimension[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 查询参数
  const [selectedDim, setSelectedDim] = useState('by_date')
  const [days, setDays] = useState(30)
  const [queryLimit, setQueryLimit] = useState(200)

  // 查询结果
  const [result, setResult] = useState<ReportResult | null>(null)
  const [querying, setQuerying] = useState(false)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [tmplRes, dimRes] = await Promise.all([
        get<{ list: ReportTemplate[] }>('/api/v1/admin/custom-reports/templates'),
        get<{ list: ReportDimension[] }>('/api/v1/admin/custom-reports/dimensions'),
      ])
      setTemplates(tmplRes.list)
      setDimensions(dimRes.list)
    } catch (err: any) {
      setError(err.message || '获取报表模板失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  const handleQuery = useCallback(async () => {
    setQuerying(true)
    setError('')
    setResult(null)
    try {
      const res = await post<ReportResult>('/api/v1/admin/custom-reports/query', {
        dimension: selectedDim,
        days,
        limit: queryLimit,
      })
      setResult(res)
    } catch (err: any) {
      setError(err.message || '查询失败')
    } finally {
      setQuerying(false)
    }
  }, [selectedDim, days, queryLimit])

  // 快速模板
  const useTemplate = (template: ReportTemplate) => {
    setSelectedDim(template.dimension)
    setDays(template.defaultDays)
  }

  // 导出 CSV
  const exportCSV = () => {
    if (!result || result.rows.length === 0) return

    const headers = Object.keys(result.rows[0])
    const csv = [
      headers.map(h => `"${h}"`).join(','),
      ...result.rows.map(row => headers.map(h => `"${row[h] ?? ''}"`).join(',')),
    ].join('\n')

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `报表_${result.dimension}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── 渲染结果表格 ──

  function renderTable() {
    if (!result) return null

    const Icon = dimIcons[result.dimension] || BarChart3

    return (
      <div className="border rounded-xl overflow-hidden">
        <div className="p-4 bg-gray-50 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon size={18} className="text-gray-500" />
            <span className="font-medium">
              {dimLabels[result.dimension] || result.dimension}
            </span>
            <span className="text-sm text-gray-500">
              ({result.days} 天, {result.from.slice(0, 10)} ~ {result.to.slice(0, 10)})
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              共 {result.total} 条记录, 展示 {result.rows.length} 行
            </span>
            {result.rows.length > 0 && (
              <button onClick={exportCSV}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 bg-white border rounded-lg hover:bg-gray-50">
                <Download size={12} /> CSV
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {result.rows.length > 0 && Object.keys(result.rows[0]).map(key => (
                  <th key={key} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase border-b">{key}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                  {Object.entries(row).map(([key, val]) => (
                    <td key={key} className="px-3 py-2 text-xs">
                      {val != null ? String(val) : '-'}
                    </td>
                  ))}
                </tr>
              ))}
              {result.rows.length === 0 && (
                <tr><td colSpan={99} className="px-3 py-10 text-center text-gray-400">无数据</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="text-emerald-500" size={28} />
            自定义报表
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            灵活选择维度、时间范围生成统计分析报表，支持 CSV 导出
          </p>
        </div>
        <button onClick={fetchTemplates}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
          <RefreshCw size={14} /> 刷新
        </button>
      </div>

      {error && <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg"><AlertCircle size={16} /> {error}</div>}

      {/* 预设模板 */}
      <div className="flex flex-wrap gap-2">
        {templates.map(tmpl => (
          <button key={tmpl.key} onClick={() => useTemplate(tmpl)}
            className="px-3 py-2 bg-white border rounded-lg text-sm hover:bg-emerald-50 hover:border-emerald-300 transition-colors text-left"
            title={tmpl.description}>
            <span className="font-medium text-emerald-700">{tmpl.name}</span>
            <p className="text-xs text-gray-400 mt-0.5">{tmpl.description}</p>
          </button>
        ))}
      </div>

      {/* 查询控件 */}
      <div className="flex flex-wrap items-center gap-3 bg-gray-50 rounded-xl p-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">维度</label>
          <select value={selectedDim} onChange={e => setSelectedDim(e.target.value)}
            className="border rounded px-2.5 py-2 text-sm">
            {dimensions.map(d => (
              <option key={d.key} value={d.key}>{d.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">天数</label>
          <input type="number" min={1} max={365} value={days}
            onChange={e => setDays(parseInt(e.target.value) || 1)}
            className="w-20 border rounded px-2.5 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">最大行数</label>
          <input type="number" min={1} max={5000} value={queryLimit}
            onChange={e => setQueryLimit(parseInt(e.target.value) || 200)}
            className="w-20 border rounded px-2.5 py-2 text-sm" />
        </div>
        <div className="self-end">
          <button onClick={handleQuery} disabled={querying}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm hover:bg-emerald-600 disabled:opacity-50">
            {querying ? <Loader2 className="animate-spin" size={16} /> : <BarChart3 size={16} />}
            {querying ? '查询中...' : '生成报表'}
          </button>
        </div>
      </div>

      {/* 报表结果 */}
      {querying ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin" size={32} /></div>
      ) : (
        renderTable()
      )}
    </div>
  )
}
