// ============================================================
//  3cloud (3C) — 数据导出按钮组件
//  支持 CSV/JSON 格式导出用量数据
// ============================================================

import { useState } from 'react'
import { Download, FileText, FileJson, ChevronDown, Loader2, Calendar } from 'lucide-react'

type ExportFormat = 'csv' | 'json'

interface ExportButtonProps {
  className?: string
}

// 简单日期选择器（最近 N 天）
const DATE_RANGES = [
  { label: '最近 7 天', days: 7 },
  { label: '最近 30 天', days: 30 },
  { label: '最近 90 天', days: 90 },
  { label: '最近 180 天', days: 180 },
  { label: '最近 365 天', days: 365 },
]

export default function ExportButton({ className = '' }: ExportButtonProps) {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<ExportFormat>('csv')
  const [days, setDays] = useState(7)
  const [loading, setLoading] = useState(false)

  const handleExport = async () => {
    setLoading(true)
    try {
      const now = new Date()
      const from = new Date(now.getTime() - days * 86400000)
      const fromStr = from.toISOString().slice(0, 10)
      const toStr = now.toISOString().slice(0, 10)

      // 使用 fetch 直接下载文件
      const token = localStorage.getItem('token')
      const res = await fetch(
        `/api/v1/me/stats/export?format=${format}&from=${fromStr}&to=${toStr}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: '导出失败' }))
        throw new Error(err.message || '导出失败')
      }

      // 获取文件名
      const disposition = res.headers.get('Content-Disposition') || ''
      const filenameMatch = disposition.match(/filename="?(.+?)"?$/)
      const filename = filenameMatch?.[1] || `usage-export-${toStr}.${format}`

      // 下载文件
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setOpen(false)
    } catch (err: any) {
      alert(err.message || '导出失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`relative ${className}`}>
      {/* 导出按钮 */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition text-sm font-medium text-slate-700"
      >
        <Download size={16} />
        导出数据
        <ChevronDown size={14} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* 下拉面板 */}
      {open && (
        <>
          {/* 背景遮罩 */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />

          {/* 面板 */}
          <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-50 p-4 space-y-4">
            {/* 格式选择 */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-2">
                导出格式
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setFormat('csv')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition text-sm ${
                    format === 'csv'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <FileText size={16} />
                  CSV
                </button>
                <button
                  onClick={() => setFormat('json')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition text-sm ${
                    format === 'json'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <FileJson size={16} />
                  JSON
                </button>
              </div>
            </div>

            {/* 时间范围 */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-2">
                <Calendar size={14} className="inline mr-1" />
                时间范围
              </label>
              <div className="grid grid-cols-2 gap-2">
                {DATE_RANGES.map((range) => (
                  <button
                    key={range.days}
                    onClick={() => setDays(range.days)}
                    className={`px-3 py-1.5 rounded-lg border transition text-sm ${
                      days === range.days
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 导出按钮 */}
            <button
              onClick={handleExport}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  导出中...
                </>
              ) : (
                <>
                  <Download size={16} />
                  开始导出
                </>
              )}
            </button>

            {/* 提示 */}
            <p className="text-xs text-slate-400 text-center">
              导出包含：日期、模型、调用次数、Token、费用
            </p>
          </div>
        </>
      )}
    </div>
  )
}
