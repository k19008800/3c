import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { Loader2 } from 'lucide-react'

/**
 * 供应商路由守卫：未登录 → /vendor/login；非 vendor 角色 → /
 */
export default function VendorRoute() {
  const { user, isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/vendor/login" replace />
  }

  if (!user || user.role !== 'vendor') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
