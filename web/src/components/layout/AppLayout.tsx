import { useState, useEffect } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import SearchModal from './SearchModal'
import { useAuth } from '@/hooks/use-auth'
import { useImpersonate } from '@/hooks/use-impersonate'
import { Loader2, ShieldAlert, Clock, LogOut, Copy } from 'lucide-react'

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [timeLeft, setTimeLeft] = useState('')
  const { isAuthenticated, isLoading } = useAuth()
  const { isImpersonating, targetEmail, expiresAt, stopImpersonate } = useImpersonate()

  // 模拟态倒计时
  useEffect(() => {
    if (!isImpersonating || !expiresAt) return
    const tick = () => {
      const diff = new Date(expiresAt).getTime() - Date.now()
      if (diff <= 0) {
        setTimeLeft('已过期')
        return
      }
      const m = Math.floor(diff / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setTimeLeft(`${m}:${s.toString().padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [isImpersonating, expiresAt])

  const handleStop = () => {
    stopImpersonate()
    window.location.href = '/console/admin/users'
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Ctrl+K / ⌘K 全局搜索快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        {/* 全局搜索模态框 */}
        <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
        {/* 模拟态横幅 */}
        {isImpersonating && (
          <div className="sticky top-0 z-30 bg-amber-50 border-b-2 border-amber-400 px-4 lg:px-6 py-2 flex items-center gap-3 text-sm flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-200 text-amber-800 font-semibold text-xs">
              <ShieldAlert size={13} /> 模拟模式
            </span>
            <span className="text-amber-800">
              以 <strong>{targetEmail}</strong> 的身份操作中
            </span>
            <button
              onClick={() => {
                const token = localStorage.getItem('impersonateToken')
                if (token) navigator.clipboard.writeText(token)
              }}
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-amber-200 text-amber-700 text-xs transition"
              title="复制模拟 Token"
            >
              <Copy size={12} /> 复制Token
            </button>
            {timeLeft && (
              <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-mono">
                <Clock size={12} /> {timeLeft}
              </span>
            )}
            <button
              onClick={handleStop}
              className="ml-auto flex items-center gap-1 px-3 py-1 rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-800 transition font-medium"
            >
              <LogOut size={14} /> 退出模拟
            </button>
          </div>
        )}
        <div className="p-4 lg:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
