import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { get, post, patch, del } from '@/lib/api'
import type { Agent, WithdrawOrder, PaginatedData } from '@/types'
import PaginationBar from '@/components/ui/PaginationBar'
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  Users,
  Wallet,
  Plus,
  CheckCircle2,
  Trash2,
} from 'lucide-react'

type Tab = 'agents' | 'withdraws'

export default function AdminAgents() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('agents')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">代理管理</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setTab('agents')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
            tab === 'agents'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Users size={16} />
          代理列表
        </button>
        <button
          onClick={() => setTab('withdraws')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
            tab === 'withdraws'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Wallet size={16} />
          提现订单
        </button>
      </div>

      {tab === 'agents' ? <AgentsList /> : <WithdrawOrders />}
    </div>
  )
}

/* ───── Agents List ───── */

function AgentsList() {
  const navigate = useNavigate()
  const [agents, setAgents] = useState<Agent[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
  const [deletingAgent, setDeletingAgent] = useState<Agent | null>(null)

  const totalPages = Math.ceil(total / pageSize)

  const fetchAgents = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<PaginatedData<Agent>>('/api/v1/admin/agents', {
        page,
        pageSize,
      })
      setAgents(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取代理列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize])

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  return (
    <>
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <span className="text-sm font-medium text-slate-700">代理列表</span>
          <div className="flex gap-2">
            <button
              onClick={() => { fetchAgents() }}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
            >
              <RefreshCw size={14} />
              刷新
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              <Plus size={14} />
              创建代理
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">ID</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">邮箱</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">昵称</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">销售佣金</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">总佣金</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">待提现</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-12">
                    <Loader2 className="animate-spin inline-block" size={24} />
                  </td>
                </tr>
              ) : agents.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    暂无代理数据
                  </td>
                </tr>
              ) : (
                agents.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm text-slate-600">{a.id}</td>
                    <td className="px-4 py-3 text-sm text-slate-900">{a.email || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{a.nickname || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => navigate(`/admin/agents/${a.id}/detail`)}
                        className="text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        详情页 &gt;
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">
                      ¥{Number(a.totalCommission || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-orange-600">
                      ¥{Number(a.pendingWithdraw || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          a.status
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {a.status ? '启用' : '禁用'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {a.createdAt
                        ? new Date(a.createdAt).toLocaleDateString('zh-CN')
                        : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => navigate(`/admin/agents/${a.id}/detail`)}
                          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          详情
                        </button>
                        <button
                          onClick={() => setEditingAgent(a)}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => navigate(`/admin/agents/${a.id}/clients`)}
                          className="text-sm text-purple-600 hover:text-purple-800"
                        >
                          客户
                        </button>
                        <button
                          onClick={() => setDeletingAgent(a)}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          <Trash2 size={14} className="inline" />
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <PaginationBar
            page={page}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            total={total}
            totalPages={totalPages}
          />
        )}
      </div>

      {/* Create Agent Modal */}
      {showCreate && (
        <CreateAgentModal
          onClose={() => { setShowCreate(false); fetchAgents() }}
        />
      )}

      {/* Edit Agent Modal */}
      {editingAgent && (
        <EditAgentModal
          agent={editingAgent}
          onClose={() => { setEditingAgent(null); fetchAgents() }}
        />
      )}

      {/* Delete Agent Modal */}
      {deletingAgent && (
        <DeleteAgentModal
          agent={deletingAgent}
          onClose={() => { setDeletingAgent(null); fetchAgents() }}
        />
      )}
    </>
  )
}

/* ───── Create Agent Modal ───── */

function CreateAgentModal({ onClose }: { onClose: () => void }) {
  const [userId, setUserId] = useState('')
  const [initialSaleRate, setInitialSaleRate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async () => {
    const uid = parseInt(userId)
    if (!uid || uid <= 0) {
      setMessage('请输入有效的用户ID')
      return
    }
    let body: Record<string, any> = { userId: uid }
    if (initialSaleRate.trim() !== '') {
      const rate = parseFloat(initialSaleRate)
      if (isNaN(rate) || rate < 0 || rate > 100) {
        setMessage('佣金比例需在 0~100 之间')
        return
      }
      body.initialSaleRate = rate
    }
    setSubmitting(true)
    setMessage('')
    try {
      await post('/api/v1/admin/agents', body)
      onClose()
    } catch (err: any) {
      setMessage(err.message || '创建代理失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">创建代理</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-xl"
            >
              &times;
            </button>
          </div>

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
            <label className="block text-sm text-slate-700 mb-1">用户ID</label>
            <input
              type="number"
              min="1"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="输入用户ID"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-700 mb-1">初始销售佣金比例 (%)</label>
            <input
              type="number"
              step="1"
              min="0"
              max="100"
              value={initialSaleRate}
              onChange={(e) => setInitialSaleRate(e.target.value)}
              placeholder="如 25 表示 25%"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-400 mt-1">留空则后续在详情页配置佣金规则</p>
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
              确认创建
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───── Edit Agent Modal ───── */

function EditAgentModal({
  agent,
  onClose,
}: {
  agent: Agent
  onClose: () => void
}) {
  const [status, setStatus] = useState(agent.status)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async () => {
    const body: any = {}
    if (status !== agent.status) {
      body.status = status
    }
    if (Object.keys(body).length === 0) {
      onClose()
      return
    }

    setSubmitting(true)
    setMessage('')
    try {
      await patch(`/api/v1/admin/agents/${agent.id}`, body)
      onClose()
    } catch (err: any) {
      setMessage(err.message || '更新代理失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">编辑代理</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-xl"
            >
              &times;
            </button>
          </div>

          {message && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
              <AlertCircle size={16} />
              {message}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-500">代理ID：</span>
              {agent.id}
            </div>
            <div>
              <span className="text-slate-500">用户ID：</span>
              {agent.userId}
            </div>
            <div>
              <span className="text-slate-500">邮箱：</span>
              {agent.email || '-'}
            </div>
            <div>
              <span className="text-slate-500">昵称：</span>
              {agent.nickname || '-'}
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-600">
            💡 佣金配置请前往「详情 → 佣金规则」页面设置
          </div>

          <div>
            <label className="block text-sm text-slate-700 mb-1">状态</label>
            <select
              value={status ? 'true' : 'false'}
              onChange={(e) => setStatus(e.target.value === 'true')}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="true">启用</option>
              <option value="false">禁用</option>
            </select>
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
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───── Delete Agent Modal ───── */

function DeleteAgentModal({
  agent,
  onClose,
}: {
  agent: Agent
  onClose: () => void
}) {
  const [confirmText, setConfirmText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const handleDelete = async () => {
    setSubmitting(true)
    setMessage('')
    try {
      await del(`/api/v1/admin/agents/${agent.id}`)
      onClose()
    } catch (err: any) {
      setMessage(err.message || '删除代理失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-red-700">确认删除代理商</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-xl"
            >
              &times;
            </button>
          </div>

          {message && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
              <AlertCircle size={16} />
              {message}
            </div>
          )}

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800 space-y-1">
            <p className="font-medium">⚠️ 此操作将：</p>
            <ul className="list-disc list-inside text-orange-700 space-y-0.5">
              <li>清除代理商身份，用户降级为普通用户</li>
              <li>删除客户绑定关系</li>
              <li>删除佣金规则配置</li>
              <li>保留历史佣金记录和提现记录</li>
            </ul>
          </div>

          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <span className="text-slate-500">代理：</span>
            <span className="font-medium text-slate-800">
              #{agent.id} · {agent.email || agent.nickname || '-'}
            </span>
          </div>

          <div>
            <label className="block text-sm text-slate-700 mb-1">
              输入 <code className="bg-slate-200 px-1 rounded">DELETE</code> 确认
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="输入 DELETE"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
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
              onClick={handleDelete}
              disabled={submitting || confirmText !== 'DELETE'}
              className="flex items-center gap-1 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              确认删除
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───── Withdraw Orders ───── */

function WithdrawOrders() {
  const [orders, setOrders] = useState<WithdrawOrder[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [reviewingOrder, setReviewingOrder] = useState<WithdrawOrder | null>(null)

  const totalPages = Math.ceil(total / pageSize)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize }
      if (statusFilter) params.status = statusFilter
      const data = await get<PaginatedData<WithdrawOrder>>(
        '/api/v1/admin/withdraws',
        params
      )
      setOrders(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取提现订单失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, statusFilter])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending_review: 'bg-orange-100 text-orange-700',
      approved: 'bg-blue-100 text-blue-700',
      rejected: 'bg-red-100 text-red-700',
      paid: 'bg-green-100 text-green-700',
    }
    const labelMap: Record<string, string> = {
      pending_review: '待审核',
      approved: '已通过',
      rejected: '已拒绝',
      paid: '已付款',
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
    <>
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-slate-500 mb-1">状态</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              <option value="pending_review">待审核</option>
              <option value="approved">已通过</option>
              <option value="rejected">已拒绝</option>
              <option value="paid">已付款</option>
            </select>
          </div>
          <button
            onClick={() => fetchOrders()}
            className="flex items-center gap-1 px-3 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <RefreshCw size={14} />
            刷新
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">ID</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">代理邮箱</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">代理昵称</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">提现金额</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">申请时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">处理时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <Loader2 className="animate-spin inline-block" size={24} />
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    暂无提现订单
                  </td>
                </tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm text-slate-600">{o.id}</td>
                    <td className="px-4 py-3 text-sm text-slate-900">
                      {o.email || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {o.nickname || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">
                      ¥{Number(o.amount || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">{statusBadge(o.status)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {o.createdAt
                        ? new Date(o.createdAt).toLocaleDateString('zh-CN')
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {o.reviewedAt
                        ? new Date(o.reviewedAt).toLocaleDateString('zh-CN')
                        : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {o.status === 'pending_review' ? (
                        <button
                          onClick={() => setReviewingOrder(o)}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          审核
                        </button>
                      ) : (
                        <span className="text-sm text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <PaginationBar
            page={page}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            total={total}
            totalPages={totalPages}
          />
        )}
      </div>

      {/* Review Modal */}
      {reviewingOrder && (
        <ReviewModal
          order={reviewingOrder}
          onClose={() => { setReviewingOrder(null); fetchOrders() }}
        />
      )}
    </>
  )
}

/* ───── Review Withdraw Modal ───── */

function ReviewModal({
  order,
  onClose,
}: {
  order: WithdrawOrder
  onClose: () => void
}) {
  const [action, setAction] = useState<'approve' | 'reject' | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async () => {
    if (!action) return
    if (action === 'reject' && !rejectReason.trim()) {
      setMessage('拒绝时请填写原因')
      return
    }
    setSubmitting(true)
    setMessage('')
    try {
      const body: any = { action }
      if (action === 'reject') body.rejectReason = rejectReason.trim()
      await post(`/api/v1/admin/withdraws/${order.id}/review`, body)
      onClose()
    } catch (err: any) {
      setMessage(err.message || '审核操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">审核提现</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-xl"
            >
              &times;
            </button>
          </div>

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

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-500">订单ID：</span>
              {order.id}
            </div>
            <div>
              <span className="text-slate-500">代理邮箱：</span>
              {order.email || '-'}
            </div>
            <div>
              <span className="text-slate-500">代理昵称：</span>
              {order.nickname || '-'}
            </div>
            <div>
              <span className="text-slate-500">金额：</span>
              ¥{Number(order.amount || 0).toFixed(2)}
            </div>
            <div>
              <span className="text-slate-500">申请时间：</span>
              {order.createdAt
                ? new Date(order.createdAt).toLocaleDateString('zh-CN')
                : '-'}
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-700 mb-2">操作</label>
            <div className="flex gap-3">
              <button
                onClick={() => { setAction('approve'); setRejectReason('') }}
                className={`flex-1 px-3 py-2 text-sm rounded-lg border transition ${
                  action === 'approve'
                    ? 'bg-green-50 border-green-400 text-green-700'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <CheckCircle2 size={16} className="inline mr-1" />
                通过
              </button>
              <button
                onClick={() => setAction('reject')}
                className={`flex-1 px-3 py-2 text-sm rounded-lg border transition ${
                  action === 'reject'
                    ? 'bg-red-50 border-red-400 text-red-700'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                拒绝
              </button>
            </div>
          </div>

          {action === 'reject' && (
            <div>
              <label className="block text-sm text-slate-700 mb-1">拒绝原因</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="请输入拒绝原因"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !action}
              className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              确认提交
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
