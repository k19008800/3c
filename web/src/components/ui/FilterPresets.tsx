/**
 * FilterPresets — 筛选条件快照组件
 *
 * 允许用户保存当前筛选条件为命名快照，下次快速切换。
 * 使用 localStorage 持久化，支持最多 10 个快照。
 *
 * @example
 * <FilterPresets
 *   currentFilters={filters}
 *   onApplyPreset={(f) => { setFilter('keyword', f.keyword); ... }}
 *   storageKey="admin-users"
 * />
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Save, FolderOpen, Trash2, X, Check, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FilterPreset {
  id: string
  name: string
  filters: Record<string, any>
  createdAt: number
}

export interface FilterPresetsProps {
  currentFilters: Record<string, any>
  onApplyPreset: (filters: Record<string, any>) => void
  storageKey: string
  className?: string
}

const MAX_PRESETS = 10

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (a == null || b == null) return false
  if (typeof a !== typeof b) return false
  if (typeof a === 'object') {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false
    for (const k of keysA) {
      if (!deepEqual(a[k], b[k])) return false
    }
    return true
  }
  return false
}

function loadPresets(key: string): FilterPreset[] {
  try {
    const raw = localStorage.getItem(`filter-preset-${key}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function savePresets(key: string, presets: FilterPreset[]) {
  try {
    localStorage.setItem(`filter-preset-${key}`, JSON.stringify(presets))
  } catch { /* quota exceeded, ignore */ }
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Internal naming dialog */
function NameDialog({
  open,
  onClose,
  onConfirm,
  existingNames,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (name: string) => void
  existingNames: string[]
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setName('')
      setError('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [open, onClose])

  const handleConfirm = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('名称不能为空')
      return
    }
    if (existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
      setError('已有同名快照')
      return
    }
    onConfirm(trimmed)
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl border border-slate-200 w-80 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-slate-900 mb-3">保存筛选快照</h3>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setError('') }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm() }}
          placeholder="输入快照名称..."
          className={cn(
            'w-full h-9 px-3 rounded-md border text-sm',
            'focus:outline-none focus:ring-2 focus:ring-blue-500',
            error ? 'border-red-400' : 'border-slate-300'
          )}
        />
        {error && (
          <p className="flex items-center gap-1 text-xs text-red-500 mt-1">
            <AlertCircle size={12} /> {error}
          </p>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

export default function FilterPresets({
  currentFilters,
  onApplyPreset,
  storageKey,
  className,
}: FilterPresetsProps) {
  const [open, setOpen] = useState(false)
  const [showNameDialog, setShowNameDialog] = useState(false)
  const [presets, setPresets] = useState<FilterPreset[]>(() => loadPresets(storageKey))
  const containerRef = useRef<HTMLDivElement>(null)

  // Persist presets on change
  useEffect(() => {
    savePresets(storageKey, presets)
  }, [presets, storageKey])

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

  const handleSave = (name: string) => {
    const newPreset: FilterPreset = {
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      filters: { ...currentFilters },
      createdAt: Date.now(),
    }
    setPresets((prev) => [newPreset, ...prev].slice(0, MAX_PRESETS))
  }

  const handleDelete = (id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id))
  }

  const handleApply = useCallback(
    (p: FilterPreset) => {
      onApplyPreset(p.filters)
      setOpen(false)
    },
    [onApplyPreset]
  )

  const isCurrentPreset = useCallback(
    (preset: FilterPreset) => deepEqual(preset.filters, currentFilters),
    [currentFilters]
  )

  return (
    <>
      <div ref={containerRef} className={cn('relative inline-block', className)}>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          title="筛选快照"
        >
          <Save size={14} />
          <span>筛选快照</span>
          {presets.length > 0 && (
            <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">
              {presets.length}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute left-0 top-full mt-1 w-72 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                已保存的快照
              </span>
              <button
                onClick={() => {
                  if (presets.length >= MAX_PRESETS) return
                  setShowNameDialog(true)
                }}
                disabled={presets.length >= MAX_PRESETS}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 text-xs rounded-md transition',
                  presets.length >= MAX_PRESETS
                    ? 'text-slate-400 cursor-not-allowed'
                    : 'text-blue-600 hover:bg-blue-50'
                )}
                title={presets.length >= MAX_PRESETS ? '最多保存 10 个快照' : '保存当前筛选'}
              >
                <FolderOpen size={12} />
                保存当前
              </button>
            </div>

            {/* Preset list */}
            {presets.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">
                暂无已保存的快照
              </div>
            ) : (
              <div className="max-h-[280px] overflow-y-auto py-1">
                {presets.map((preset) => {
                  const active = isCurrentPreset(preset)
                  return (
                    <div
                      key={preset.id}
                      className={cn(
                        'group flex items-center gap-2 px-4 py-2.5 cursor-pointer transition',
                        active ? 'bg-blue-50' : 'hover:bg-slate-50'
                      )}
                      onClick={() => handleApply(preset)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={cn(
                            'text-sm truncate',
                            active ? 'text-blue-700 font-medium' : 'text-slate-800'
                          )}>
                            {preset.name}
                          </span>
                          {active && (
                            <Check size={12} className="text-blue-600 shrink-0" />
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {formatDate(preset.createdAt)}
                        </p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(preset.id) }}
                        className="shrink-0 p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <NameDialog
        open={showNameDialog}
        onClose={() => setShowNameDialog(false)}
        onConfirm={handleSave}
        existingNames={presets.map((p) => p.name)}
      />
    </>
  )
}
