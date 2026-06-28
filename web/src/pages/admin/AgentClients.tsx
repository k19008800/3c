import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { get, post } from '@/lib/api'
import type { AgentClientDetail } from '@/types'
import {
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ArrowLeft,
  UserPlus,
} from 'lucide-react'

export default function AdminAgentClients() {
  const { agentId } = useParams<{ agentId: string }>()
  const navigate = useNavigate()
  const id = parseInt(agentId || '0', 10)

  const [data, setData] = useState<AgentClientDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [showBind, setShowBind] = useState(false)

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0

  const fetchData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const res = await get<AgentClientDetail>(
        `/api/v1/admin/agents/${id}/clients`,
        { page, pageSize }
      )
      setData(res)
    } catch (err: any) {
      setError(err.message || '获取客户列表失败')
    } finally {
      setLoading(false)
    }
  }, [id, page, pageSize])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (!id) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
        <AlertCircle size={16} />
        无效的代理商 ID
      </div>
    )
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: 'bg-green-100 text-green-700',
      pending: 'bg-orange-100 text-orange-700',
      disabled: 'bg-red-100 text-red-700',
    }
    const labelMap: Record<string, string> = {
      active: '正常',
      pending: '未验证',
      disabled: '已禁用',
    }
    return (
      <span
        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
          map[status] || 'bg-slate-100 text-slate-500'
        }`}
      >
        {labelMap[status] || status}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/agents')}
            className="p-1.5 rounded-lg hover:bg-slate-200 transition"
          >
            <ArrowLeft size={20} className="text-slate-500" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">代理商客户管理</h1>
            {data && (
              <p className="text-sm text-slate-500 mt-0.5">
                {data.agent.nickname || data.agent.email || `代理商 #${data.agent.id}`}
                {' · '}
                分佣 {data.agent.commissionRate ? `${(Number(data.agent.commissionRate) * 100).toFixed(1)}%` : '未设置'}
                {' · '}
                累计佣金 ¥{Number(data.agent.totalCommission).toFixed(2)}
                {' · '}
                可提现 ¥{Number(data.agent.pendingWithdraw).toFixed(2)}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fetchData()}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <RefreshCw size={14} />
            刷新
          </button>
          <button
            onClick={() => setShowBind(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <UserPlus size={14} />
            绑定客户
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Client Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <span className="text-sm font-medium text-slate-700">
            客户列表（{data?.total ?? '-'}）
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">用户ID</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">邮箱</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">昵称</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">类型</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">余额</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">累计消费</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">贡献佣金</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">佣金笔数</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">绑定时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center py-12">
                    <Loader2 className="animate-spin inline-block" size={24} />
                  </td>
                </tr>
              ) : !data || data.list.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-400">
                    暂无绑定客户。点击「绑定客户」手动绑定。
                  </td>
                </tr>
              ) : (
                data.list.map((c) => (
                  <tr key={c.clientUserId} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm text-slate-600">{c.clientUserId}</td>
                    <td className="px-4 py-3 text-sm text-slate-900">{c.email}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{c.nickname || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {c.userType === 'enterprise' ? '企业' : '个人'}
                    </td>
                    <td className="px-4 py-3">{statusBadge(c.status)}</td>
                    <td className="px-4 py-3 text-sm font-medium">
                      ¥{Number(c.balance || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      ¥{Number(c.totalCallCost || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-green-600">
                      ¥{Number(c.totalCommission || 0).toFixed(4)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{c.commissionCount}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {c.boundAt
                        ? new Date(c.boundAt).toLocaleDateString('zh-CN')
                        : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {data && data.total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <span className="text-sm text-slate-500">
              第 {page} / {totalPages} 页，共 {data.total} 条
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 transition"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 transition"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bind Client Modal */}
      {showBind && (
        <BindClientModal
          agentId={id}
          onClose={() => { setShowBind(false); fetchData() }}
        />
      )}
    </div>
  )
}

/* ───── Bind Client Modal ───── */

function BindClientModal({
  agentId,
  onClose,
}: {
  agentId: number
  onClose: () => void
}) {
  const [clientUserId, setClientUserId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async () => {
    const uid = parseInt(clientUserId)
    if (!uid || uid <= 0) {
      setMessage('请输入有效的用户ID')
      return
    }
    setSubmitting(true)
    setMessage('')
    try {
      await post(`/api/v1/admin/agents/${agentId}/clients`, {
        clientUserId: uid,
      })
      onClose()
    } catch (err: any) {
      setMessage(err.message || '绑定客户失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">绑定客户</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-xl"
            >
              &times;
            </button>
          </div>

          <p className="text-xs text-slate-400">
            将已有用户绑定为当前代理商的客户。绑定后，该客户的调用消费将计入代理商佣金。
          </p>

          {message && (
            <div
              className={`flex items-center gap-2 p-3 text-sm rounded-lg ${
                message.includes('失败')
                  ? 'bg-red-50 text-red-600'
                  : 'bg-blue-50 text-blue-700'
              }`}
            >
              <AlertCircle size={16} />
              {message}
            </div>
          )}

          <div>
            <label className="block text-sm text-slate-700 mb-1">客户用户ID</label>
            <input
              type="number"
              min="1"
              value={clientUserId}
              onChange={(e) => setClientUserId(e.target.value)}
              placeholder="输入客户在系统中的用户ID"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              确认绑定
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
