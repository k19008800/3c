import { useState } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import VendorSidebar from './VendorSidebar'
import { useAuth } from '@/hooks/use-auth'
import { Loader2, Bell } from 'lucide-react'

export default function VendorLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const { isAuthenticated, isLoading, user } = useAuth()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/vendor/login" replace />
  }

  if (user && user.role !== 'vendor') {
    return <Navigate to="/" replace />
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <VendorSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6 shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-700">供应商控制台</h2>
            {user && (
              <span className="text-xs text-slate-400">
                {user.nickname || user.email}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
              title="通知"
            >
              <Bell size={18} />
            </button>
          </div>
        </header>
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
