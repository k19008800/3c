import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'

// 加载全局功能描述（self-registering）
import '@/pages/admin/feature-descriptions'

const ADMIN_ROLES = ['super_admin', 'admin', 'finance_ops', 'ops', 'support', 'auditor']

/**
 * 管理后台路由守卫：非管理角色访问 /admin/* 会被重定向到 /
 */
export default function AdminRoute() {
  const { user, isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
