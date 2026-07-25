import { useEffect, useState, useCallback } from 'react'
import { get, post, del } from '@/lib/api'
import {
  Loader2, AlertCircle, BarChart3, Plus, RefreshCw, Save,
  Download, Trash2, Eye, X
} from 'lucide-react'

interface ReportTemplate {
  id: string
  name: string
  category: string
  description: string
  defaultMetrics: string[]
  table: string
  groupBy: string
}

interface QueryResult {
  template: { id: string; name: string }
  dateRange: string
  metrics: string[]
  rows: any[]
  summary: {
    totalRows: number
    totalCount: number
    dateFrom: string
    dateTo: string
  } | null
  generatedAt: string
}

interface SavedReport {
  id: string
  name: string
  templateId: string
  dateRange: string
  metrics: string[]
  createdAt: string
  createdBy: number
}

const categoryLabels: Record<string, string> = {
  usage: '用量分析',
  finance: '财务',
  monitor: '监控',
  user: '用户',
  security: '安全',
  agent: '代理',
}

const categoryColors: Record<string, string> = {
  usage: 'bg-blue-100 text-blue-700',
  finance: 'bg-green-100 text-green-700',
  monitor: 'bg-orange-100 text-orange-700',
  user: 'bg-purple-100 text-purple-700',
  security: 'bg-red-100 text-red-700',
  agent: 'bg-indigo-100 text-indigo-700',
}

export default function AdminReports() {
  const [templates, setTemplates] = useState<ReportTemplate[]>([])
  const [savedReports, setSavedReports] = useState<SavedReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 查询状态
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [dateRange, setDateRange] = useState('7d')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [queryLoading, setQueryLoading] = useState(false)

  // 保存状态
  const [reportName, setReportName] = useState('')
  const [saving, setSaving] = useState(false)
  const [showSaved, setShowSaved] = useState(false)

  const fetchInit = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [tplRes, savedRes] = await Promise.all([
        get<{ list: ReportTemplate[] }>('/api/v1/admin/reports/templates'),
        get<{ list: SavedReport[] }>('/api/v1/admin/reports/saved'),
      ])
      setTemplates(tplRes.list)
      setSavedReports(savedRes.list)
    } catch (err: any) {
      setError(err.message || '获取报表配置失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchInit() }, [fetchInit])

  // ── 执行查询 ──

  const handleQuery = useCallback(async (tplId?: string, range?: string) => {
    const tid = tplId || selectedTemplate
    if (!tid) return

    setQueryLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await post<QueryResult>('/api/v1/admin/reports/query', {
        templateId: tid,
        dateRange: range || dateRange,
      })
      setResult(res)
    } catch (err: any) {
      setError(err.message || '查询失败')
    } finally {
      setQueryLoading(false)
    }
  }, [selectedTemplate, dateRange])

  // ── 保存报表 ──

  const handleSave = async () => {
    if (!reportName.trim() || !selectedTemplate) return
    setSaving(true)
    setError('')
    try {
      await post('/api/v1/admin/reports/saved', {
        name: reportName,
        templateId: selectedTemplate,
        dateRange,
        metrics: [],
      })
      setReportName('')
      const res = await get<{ list: SavedReport[] }>('/api/v1/admin/reports/saved')
      setSavedReports(res.list)
    } catch (err: any) {
      setError(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  // ── 删除保存的报表 ──

  const deleteSaved = async (id: string) => {
    if (!confirm('确定删除此保存的报表？')) return
    try {
      await del(`/api/v1/admin/reports/saved/${id}`)
      setSavedReports(prev => prev.filter(r => r.id !== id))
    } catch (err: any) {
      setError(err.message || '删除失败')
    }
  }

  // ── 加载保存的报表 ──

  const loadSaved = (rpt: SavedReport) => {
    setSelectedTemplate(rpt.templateId)
    setDateRange(rpt.dateRange)
    setShowSaved(false)
    handleQuery(rpt.templateId, rpt.dateRange)
  }

  // ── 导出 CSV ──

  const exportCsv = () => {
    if (!result || result.rows.length === 0) return
    const headers = Object.keys(result.rows[0])
    const csv = [
      headers.join(','),
      ...result.rows.map(row => headers.map(h => {
        const val = row[h]
        return typeof val === 'string' && val.includes(',') ? `"${val}"` : val
      }).join(',')),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${result.template.name}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── 分类分组 ──

  const groupedTemplates = templates.reduce<Record<string, ReportTemplate[]>>((acc, tpl) => {
    if (!acc[tpl.category]) acc[tpl.category] = []
    acc[tpl.category].push(tpl)
    return acc
  }, {})

  // ── 渲染表格 ──

  function renderTable() {
    if (!result || result.rows.length === 0) {
      return <p className="text-center text-gray-400 py-10">查询结果为空</p>
    }

    const headers = Object.keys(result.rows[0])

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              {headers.map(h => <th key={h} className="pb-2 font-medium whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                {headers.map(h => (
                  <td key={h} className="py-2 text-gray-700 whitespace-nowrap">
                    {typeof row[h] === 'number' ? row[h].toLocaleString() : (row[h] || '-')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {result.summary && (
          <div className="mt-3 text-xs text-gray-500 flex items-center gap-4">
            <span>数据行数: {result.summary.totalRows}</span>
            <span>总数: {result.summary.totalCount.toLocaleString()}</span>
            <span>范围: {result.summary.dateFrom} ~ {result.summary.dateTo}</span>
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin" size={32} /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="text-emerald-500" size={28} />
            自定义报表
          </h1>
          <p className="text-sm text-gray-500 mt-1">预置报表模板、自定义查询、数据导出</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSaved(!showSaved)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            <Eye size={14} /> 已保存 ({savedReports.length})
          </button>
          <button onClick={fetchInit} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            <RefreshCw size={14} /> 刷新
          </button>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg"><AlertCircle size={16} /> {error}</div>}

      {/* 已保存的报表弹窗 */}
      {showSaved && (
        <div className="border rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">已保存的报表</h3>
            <button onClick={() => setShowSaved(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
          {savedReports.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">暂无保存的报表</p>
          ) : (
            savedReports.map(rpt => (
              <div key={rpt.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                <div>
                  <span className="text-sm font-medium">{rpt.name}</span>
                  <span className="text-xs text-gray-400 ml-2">
                    {templates.find(t => t.id === rpt.templateId)?.name || rpt.templateId}
                    {' | '}{rpt.dateRange}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => loadSaved(rpt)} className="text-xs text-indigo-600 hover:text-indigo-700">加载</button>
                  <button onClick={() => deleteSaved(rpt.id)} className="text-xs text-red-500 hover:text-red-600">删除</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 报表配置区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：模板选择 */}
        <div className="space-y-4">
          <h2 className="font-semibold">报表模板</h2>

          {Object.entries(groupedTemplates).map(([category, tpls]) => (
            <div key={category}>
              <h3 className={`text-xs font-medium mb-2 inline-block px-2 py-0.5 rounded ${categoryColors[category] || 'bg-gray-100 text-gray-600'}`}>
                {categoryLabels[category] || category}
              </h3>
              <div className="space-y-1">
                {tpls.map(tpl => (
                  <button
                    key={tpl.id}
                    onClick={() => setSelectedTemplate(tpl.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedTemplate === tpl.id
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'hover:bg-gray-50 border border-transparent'
                    }`}
                  >
                    <div className="font-medium">{tpl.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{tpl.description}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 右侧：查询配置和结果 */}
        <div className="lg:col-span-2 space-y-4">
          {/* 查询参数 */}
          {selectedTemplate && (
            <div className="border rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">时间范围</label>
                  <select value={dateRange} onChange={e => setDateRange(e.target.value)}
                    className="border rounded-lg px-3 py-2 text-sm w-full">
                    <option value="7d">最近 7 天</option>
                    <option value="30d">最近 30 天</option>
                    <option value="90d">最近 90 天</option>
                    <option value="1y">最近 1 年</option>
                  </select>
                </div>
                <div className="flex items-end gap-2">
                  <button onClick={() => handleQuery()} disabled={queryLoading}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50">
                    {queryLoading ? <Loader2 className="animate-spin" size={16} /> : <BarChart3 size={16} />}
                    {queryLoading ? '查询中...' : '生成报表'}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input type="text" value={reportName} onChange={e => setReportName(e.target.value)}
                  placeholder="保存为（输入报表名称）..." className="flex-1 border rounded-lg px-3 py-2 text-sm" />
                <button onClick={handleSave} disabled={saving || !reportName.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50">
                  <Save size={14} /> 保存
                </button>
                {result && result.rows.length > 0 && (
                  <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50">
                    <Download size={14} /> CSV
                  </button>
                )}
              </div>
            </div>
          )}

          {!selectedTemplate && !result && (
            <div className="text-center py-20 text-gray-400">
              <BarChart3 size={48} className="mx-auto mb-3 opacity-30" />
              <p>选择一个报表模板开始</p>
              <p className="text-sm mt-1">从左侧选择预设模板或保存的自定义报表</p>
            </div>
          )}

          {/* 查询结果 */}
          {result && (
            <div className="border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{result.template.name}</h3>
                  <span className="text-xs text-gray-400">{result.dateRange === '7d' ? '最近7天' : result.dateRange === '30d' ? '最近30天' : result.dateRange === '90d' ? '最近90天' : '最近1年'}</span>
                </div>
                <span className="text-xs text-gray-400">生成: {new Date(result.generatedAt).toLocaleString('zh-CN')}</span>
              </div>

              {queryLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="animate-spin" size={24} /></div>
              ) : (
                renderTable()
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
