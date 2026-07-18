/**
 * InlineEdit — 行内编辑组件
 *
 * 双击文本进入编辑模式，Enter 保存，Esc 取消。
 * 支持 text / number / email / select 四种类型。
 *
 * @example
 * <InlineEdit
 *   value={user.nickname}
 *   onSave={async (v) => { await patchUser(user.id, { nickname: v }) }}
 *   validator={(v) => !v.trim() ? '昵称不能为空' : undefined}
 * />
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Pencil, Check, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface InlineEditProps {
  value: string | number
  onSave: (newValue: string) => Promise<void> | void
  type?: 'text' | 'number' | 'email' | 'select'
  options?: { value: string; label: string }[]
  className?: string
  disabled?: boolean
  placeholder?: string
  validator?: (value: string) => string | undefined
}

export default function InlineEdit({
  value,
  onSave,
  type = 'text',
  options,
  className,
  disabled = false,
  placeholder,
  validator,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync draft when value or editing changes
  useEffect(() => {
    if (!editing) setDraft(String(value))
  }, [value, editing])

  // Auto focus + select when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      if (type !== 'select') {
        ;(inputRef.current as HTMLInputElement).select()
      }
    }
  }, [editing, type])

  // Click outside listener
  useEffect(() => {
    if (!editing) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        cancelEdit()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  const commitSave = useCallback(async () => {
    // Validate
    if (validator) {
      const err = validator(draft)
      if (err) {
        setError(err)
        return
      }
    }
    setError(undefined)
    setSaving(true)
    try {
      await onSave(draft)
      setEditing(false)
    } catch (err: any) {
      setError(err?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }, [draft, onSave, validator])

  const cancelEdit = useCallback(() => {
    setDraft(String(value))
    setError(undefined)
    setEditing(false)
  }, [value])

  // Keyboard handlers
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && type !== 'select') {
      e.preventDefault()
      commitSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }

  // Clear error on input change
  const handleChange = (val: string) => {
    setDraft(val)
    if (error) setError(undefined)
  }

  // ── Display mode ──
  if (!editing) {
    return (
      <div
        ref={containerRef}
        className={cn(
          'group relative inline-flex items-center gap-1 cursor-pointer rounded px-1 -mx-1 transition-colors',
          disabled && 'cursor-default opacity-60 pointer-events-none',
          !disabled && 'hover:bg-slate-100',
          className
        )}
        onDoubleClick={() => { if (!disabled) setEditing(true) }}
      >
        <span className={cn(
          'text-sm truncate max-w-[200px]',
          !String(value) && 'text-slate-400 italic'
        )}>
          {String(value) || placeholder || '—'}
        </span>
        {!disabled && (
          <Pencil
            size={12}
            className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            onClick={(e) => { e.stopPropagation(); setEditing(true) }}
          />
        )}
      </div>
    )
  }

  // ── Edit mode ──
  return (
    <div ref={containerRef} className={cn('inline-flex flex-col gap-0.5', className)}>
      <div className="flex items-center gap-1">
        {/* Input field */}
        {type === 'select' ? (
          <select
            ref={inputRef as React.Ref<HTMLSelectElement>}
            value={draft}
            onChange={(e) => handleChange(e.target.value)}
            disabled={saving}
            className={cn(
              'h-9 rounded-md border bg-transparent px-3 py-1 text-sm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              error ? 'border-red-400' : 'border-slate-300',
              'disabled:opacity-50'
            )}
          >
            {options?.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        ) : (
          <input
            ref={inputRef as React.Ref<HTMLInputElement>}
            type={type}
            value={draft}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={saving}
            placeholder={placeholder}
            className={cn(
              'h-9 rounded-md border bg-transparent px-3 py-1 text-sm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              error ? 'border-red-400' : 'border-slate-300',
              'disabled:opacity-50'
            )}
          />
        )}

        {/* Save button */}
        <button
          onClick={commitSave}
          disabled={saving}
          className="flex items-center justify-center w-7 h-7 rounded hover:bg-green-100 text-green-600 transition disabled:opacity-50"
          aria-label="保存"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        </button>

        {/* Cancel button */}
        <button
          onClick={cancelEdit}
          disabled={saving}
          className="flex items-center justify-center w-7 h-7 rounded hover:bg-red-100 text-red-500 transition disabled:opacity-50"
          aria-label="取消"
        >
          <X size={14} />
        </button>
      </div>

      {/* Error message */}
      {error && (
        <span className="text-xs text-red-500 ml-1">{error}</span>
      )}
    </div>
  )
}
