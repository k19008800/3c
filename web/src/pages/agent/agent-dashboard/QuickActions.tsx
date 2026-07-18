import { RefreshCw } from 'lucide-react'
import { type QuickActionsProps } from './types'

/**
 * 快捷操作 — 页面标题 + 刷新按钮
 *
 * 【状态覆盖】
 *  - 单态：始终显示标题和刷新按钮
 */
export default function QuickActions({ onRefresh }: QuickActionsProps) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-bold text-slate-900">代理商面板</h1>
      <button
        onClick={onRefresh}
        className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
      >
        <RefreshCw size={14} />
        刷新
      </button>
    </div>
  )
}
