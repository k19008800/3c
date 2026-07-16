/**
 * SlideDrawer — 侧滑面板
 *
 * 替代 Modal 用于详情展示，保留列表页面上下文。
 * 支持不同宽度、加载状态、错误状态。
 *
 * @example
 * <SlideDrawer
 *   open={!!selectedUser}
 *   onClose={() => setSelectedUser(null)}
 *   title="用户详情"
 *   width="lg"
 * >
 *   <UserDetailTabs userId={selectedUser!.id} />
 * </SlideDrawer>
 */

import { useEffect, ReactNode } from 'react'
import { X, Loader2, AlertCircle } from 'lucide-react'

const WIDTH_MAP: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  full: 'max-w-full',
}

interface SlideDrawerProps {
  open: boolean
  onClose: () => void
  title: string
  width?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
  children: ReactNode
  loading?: boolean
  error?: string
  /** 关闭时是否销毁内容 */
  destroyOnClose?: boolean
}

export default function SlideDrawer({
  open,
  onClose,
  title,
  width = 'md',
  children,
  loading,
  error,
  destroyOnClose = true,
}: SlideDrawerProps) {
  // ESC 键关闭
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // 锁定 body 滚动
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open && destroyOnClose) return null

  return (
    <>
      {/* 遮罩 */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* 面板 */}
      <div
        className={`fixed top-0 right-0 z-50 h-full bg-white shadow-2xl 
                    transform transition-transform duration-300 ease-in-out
                    ${WIDTH_MAP[width] || WIDTH_MAP.md} w-full
                    ${open ? 'translate-x-0' : 'translate-x-full'}
                    flex flex-col`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-base font-semibold text-slate-900 truncate">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-slate-400" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20">
              <AlertCircle size={24} className="text-red-400 mb-3" />
              <p className="text-sm text-red-600">{error}</p>
              <button onClick={onClose} className="mt-3 text-sm text-blue-600 hover:text-blue-800">
                关闭
              </button>
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </>
  )
}
