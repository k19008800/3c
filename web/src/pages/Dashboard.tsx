import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { get } from '@/lib/api'
import type { LogSummary } from '@/types'
import { Loader2, DollarSign, Activity, Cpu, Wallet, Key, FileText, AlertCircle, Shield, Clock, CheckCircle2, XCircle } from 'lucide-react'

export default function Dashboard() {
  const { user } = useAuth()
  const [summary, setSummary] = useState<LogSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loginHistory, setLoginHistory] = useState<LoginHistoryItem[]>([])

  useEffect(() => {
    get<LogSummary>('/api/v1/logs/summary')
      .then(setSummary)
      .catch((err) => setError(err.message || '获取统计数据失败'))
      .finally(() => setLoading(false))

    get<{ list: LoginHistoryItem[] }>('/api/v1/auth/security/login-history?limit=5')
      .then((d) => setLoginHistory(d.list))
      .catch(() => {})
  }, [])

  const StatCard = ({ icon: Icon, label, value, sub, color }: any) => (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon size={24} className="text-white" />
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-6 text-white">
        <h1 className="text-2xl font-bold">欢迎回来！</h1>
        <p className="mt-2 opacity-90">{user?.email}</p>
        <div className="flex gap-4 mt-3">
          <span className="bg-white/20 px-3 py-1 rounded-full text-sm">
            余额：¥{Number(user?.balance || 0).toFixed(4)}
          </span>
          <span className="bg-white/20 px-3 py-1 rounded-full text-sm">
            角色：{user?.role === 'super_admin' ? '超级管理员' : user?.role === 'admin' ? '管理员' : '用户'}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <div className="col-span-4 flex justify-center py-12">
            <Loader2 className="animate-spin" size={32} />
          </div>
        ) : error ? (
          <div className="col-span-4 flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg">
            <AlertCircle size={18} />
            {error}
          </div>
        ) : summary ? (
          <>
            <StatCard
              icon={Activity}
              label="总调用次数"
              value={summary.totalCalls.toLocaleString()}
              sub={`成功 ${summary.successCalls} / 失败 ${summary.failedCalls}`}
              color="bg-blue-500"
            />
            <StatCard
              icon={Cpu}
              label="总 Token 消耗"
              value={Number(summary.totalTokens / 10000).toFixed(2) + '万'}
              sub={Number(summary.totalTokens).toLocaleString() + ' tokens'}
              color="bg-purple-500"
            />
            <StatCard
              icon={DollarSign}
              label="总消费"
              value={'¥' + Number(summary.totalCost).toFixed(4)}
              color="bg-green-500"
            />
            <StatCard
              icon={Wallet}
              label="当前余额"
              value={'¥' + Number(user?.balance || 0).toFixed(4)}
              color="bg-orange-500"
            />
          </>
        ) : null}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold mb-4">快捷操作</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            to="/recharge"
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition group"
          >
            <Wallet size={24} className="text-blue-500 group-hover:scale-110 transition" />
            <div>
              <p className="font-medium text-slate-900">充值</p>
              <p className="text-sm text-slate-500">为账户充值</p>
            </div>
          </Link>
          <Link
            to="/api-keys"
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 hover:border-purple-300 hover:bg-purple-50 transition group"
          >
            <Key size={24} className="text-purple-500 group-hover:scale-110 transition" />
            <div>
              <p className="font-medium text-slate-900">API 密钥</p>
              <p className="text-sm text-slate-500">管理 API 密钥</p>
            </div>
          </Link>
          <Link
            to="/logs"
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 hover:border-green-300 hover:bg-green-50 transition group"
          >
            <FileText size={24} className="text-green-500 group-hover:scale-110 transition" />
            <div>
              <p className="font-medium text-slate-900">调用日志</p>
              <p className="text-sm text-slate-500">查看调用记录</p>
            </div>
          </Link>
        </div>
      </div>

      {loginHistory.length > 0 && (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={20} className="text-blue-500" />
          <h2 className="text-lg font-semibold">最近登录</h2>
          <Link to="/security" className="ml-auto text-xs text-blue-600 hover:underline">查看全部 →</Link>
        </div>
        <div className="space-y-2">
          {loginHistory.slice(0, 3).map((h) => (
            <div key={h.id} className="flex items-center gap-3 text-sm">
              {h.success
                ? <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                : <XCircle size={14} className="text-red-500 shrink-0" />
              }
              <span className="text-slate-600">
                {h.city ? `${h.city} ` : ''}
                {new Date(h.createdAt).toLocaleString('zh-CN')}
              </span>
              <span className="text-xs text-slate-400 font-mono">{h.ip}</span>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  )
}
