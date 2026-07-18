/**
 * ExportMenu — 统一导出菜单组件
 *
 * 下拉菜单式导出按钮，支持多格式导出（CSV / Excel / JSON 等）。
 *
 * @example
 * <ExportMenu
 *   onExport={async (format) => {
 *     const res = await fetch(`/api/export?format=${format}`)
 *     return res.blob()
 *   }}
 *   filename="users-report"
 * />
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Download, FileSpreadsheet, FileJson, FileText, Loader2, Check, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ExportFormat {
  key: string
  label: string
  icon?: React.ReactNode
  mimeType: string
  extension: string
}

export interface ExportMenuProps {
  formats?: ExportFormat[]
  onExport: (format: string) => Promise<Blob | string>
  filename?: string
  size?: 'sm' | 'md'
  disabled?: boolean
  className?: string
}

const DEFAULT_FORMATS: ExportFormat[] = [
  { key: 'csv', label: 'CSV', icon: <FileText size={16} />, mimeType: 'text/csv', extension: 'csv' },
  { key: 'xlsx', label: 'Excel', icon: <FileSpreadsheet size={16} />, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx' },
  { key: 'json', label: 'JSON', icon: <FileJson size={16} />, mimeType: 'application/json', extension: 'json' },
]

export default function ExportMenu({
  formats = DEFAULT_FORMATS,
  onExport,
  filename = 'export',
  size = 'md',
  disabled = false,
  className,
}: ExportMenuProps) {
  const [open, setOpen] = useState(false)
  const [exportingKey, setExportingKey] = useState<string | null>(null)
  const [successKey, setSuccessKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Auto-close after success
  useEffect(() => {
    if (successKey) {
      const t = setTimeout(() => {
        setOpen(false)
        setSuccessKey(null)
      }, 1000)
      return () => clearTimeout(t)
    }
  }, [successKey])

  const handleExport = useCallback(
    async (fmt: ExportFormat) => {
      setError(null)
      setExportingKey(fmt.key)
      try {
        const result = await onExport(fmt.key)
        // Download
        const blob = typeof result === 'string' ? await fetch(result).then((r) => r.blob()) : result
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${filename}.${fmt.extension}`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(url), 10000)
        setExportingKey(null)
        setSuccessKey(fmt.key)
      } catch (err: any) {
        setExportingKey(null)
        setError(err?.message || '导出失败，请重试')
      }
    },
    [onExport, filename]
  )

  // Size tokens
  const tokens = size === 'sm'
    ? { button: 'px-2.5 py-1.5 text-xs', icon: 14, menuItem: 'px-3 py-2 text-xs' }
    : { button: 'px-3 py-2 text-sm', icon: 16, menuItem: 'px-4 py-2.5 text-sm' }

  return (
    <div ref={containerRef} className={cn('relative inline-block', className)}>
      {/* Trigger button */}
      <button
        onClick={() => { if (!disabled) setOpen(!open) }}
        disabled={disabled}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border border-slate-300 transition',
          'text-slate-700 bg-white hover:bg-slate-50',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          tokens.button,
          open && 'ring-2 ring-blue-500 border-blue-400'
        )}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download size={tokens.icon} />
        <span>导出</span>
      </button>

      {/* Dropdown menu */}
      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden"
          role="menu"
        >
          {formats.map((fmt) => {
            const isExporting = exportingKey === fmt.key
            const isSuccess = successKey === fmt.key

            return (
              <button
                key={fmt.key}
                onClick={() => { if (!isExporting) handleExport(fmt) }}
                disabled={exportingKey !== null}
                className={cn(
                  'w-full flex items-center gap-3 transition',
                  tokens.menuItem,
                  'hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed'
                )}
                role="menuitem"
              >
                <span className="text-slate-500 shrink-0">
                  {isSuccess ? (
                    <Check size={16} className="text-green-500" />
                  ) : isExporting ? (
                    <Loader2 size={16} className="animate-spin text-blue-500" />
                  ) : (
                    fmt.icon
                  )}
                </span>
                <span className="flex-1 text-left">
                  {isExporting ? '导出中…' : isSuccess ? '已下载' : fmt.label}
                </span>
                <span className="text-[10px] text-slate-400 uppercase">
                  .{fmt.extension}
                </span>
              </button>
            )
          })}

          {/* Error display */}
          {error && (
            <div className="flex items-center gap-1.5 px-4 py-2 bg-red-50 border-t border-red-100">
              <AlertCircle size={12} className="text-red-500 shrink-0" />
              <span className="text-xs text-red-600">{error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
