import { useState, useRef, useEffect } from 'react'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FeatureDesc {
  title: string
  summary: string
  details?: string[]
  usage?: string
}

/**
 * 全局功能描述配置 —— 在 feature-descriptions.ts 中定义
 */
let _registry: Record<string, FeatureDesc> = {}

export function registerFeatureDescriptions(map: Record<string, FeatureDesc>) {
  _registry = map
}

function getDesc(pageKey: string): FeatureDesc | undefined {
  return _registry[pageKey]
}

/**
 * FeatureDescription — 页面功能说明浮标
 *
 * 在每个管理后台页面标题旁边放置一个 ⓘ 图标，
 * 鼠标悬浮时弹出功能说明气泡。
 *
 * @param page - 页面路由 key（如 "admin/finance/prices"）
 * @param className - 额外的样式类
 */
export default function FeatureDescription({
  page,
  className,
}: {
  page: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const desc = getDesc(page)

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // ESC 关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  if (!desc) return null

  return (
    <div ref={ref} className={cn('relative inline-flex items-center', className)}>
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen(!open)}
        className="inline-flex items-center justify-center w-5 h-5 text-slate-400 hover:text-indigo-500 transition-colors focus:outline-none"
        title={`了解 "${desc.title}" 功能`}
        aria-label={`了解 "${desc.title}" 功能`}
      >
        <HelpCircle size={16} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1.5 z-50 w-80 p-4 bg-white rounded-xl shadow-lg border border-slate-200 text-sm"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <h4 className="font-semibold text-slate-800 mb-1.5">{desc.title}</h4>
          <p className="text-slate-600 leading-relaxed mb-2">{desc.summary}</p>

          {desc.details && desc.details.length > 0 && (
            <ul className="space-y-1 mb-2">
              {desc.details.map((d, i) => (
                <li key={i} className="flex items-start gap-1.5 text-slate-500 text-xs leading-relaxed">
                  <span className="text-indigo-400 mt-0.5 shrink-0">·</span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          )}

          {desc.usage && (
            <div className="border-t border-slate-100 pt-2 mt-1">
              <p className="text-xs text-slate-400 leading-relaxed">
                <span className="font-medium text-slate-500">💡 日常操作：</span>
                {desc.usage}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
