import { useState } from 'react'
import { Download, FileText, Loader2, CheckCircle2 } from 'lucide-react'
import api from '@/lib/api'

interface ExportButtonProps {
  filters: Record<string, any>
}

export default function LogExportButton({ filters }: ExportButtonProps) {
  const [open, setOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [done, setDone] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      params.set('format', 'csv')
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== '' && v !== undefined && v !== null) params.set(k, String(v))
      })

      const res = await api.get('/api/v1/logs/export', {
        params,
        responseType: 'blob',
      })

      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `call-logs-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      setDone(true)
      setTimeout(() => { setDone(false); setOpen(false) }, 1500)
    } catch (err: any) {
      alert('导出失败: ' + (err.message || '未知错误'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
      >
        <Download size={14} />
        导出
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-lg shadow-lg border border-slate-200 z-20 p-3 space-y-2">
            <p className="text-xs text-slate-500 mb-1">导出当前筛选条件下的调用记录</p>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-2 w-full px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-60 transition"
            >
              {exporting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : done ? (
                <CheckCircle2 size={14} />
              ) : (
                <FileText size={14} />
              )}
              {exporting ? '导出中...' : done ? '导出成功 ✓' : '导出 CSV'}
            </button>
            <p className="text-[10px] text-slate-400">UTF-8 CSV 格式，可直接用 Excel 打开</p>
          </div>
        </>
      )}
    </div>
  )
}
