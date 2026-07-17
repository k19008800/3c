import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { get, post, patch, del } from '@/lib/api'
import type { Agent, PaginatedData } from '@/types'
import PaginationBar from '@/components/ui/PaginationBar'
import { TableSkeleton } from '@/components/ui/skeleton'
import MiniChart from '@/components/ui/MiniChart'
import type { MiniChartDataPoint } from '@/components/ui/MiniChart'
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  Plus,
  Trash2,
} from 'lucide-react'

/* ═══════════════════════════════════════
   Props
   ═══════════════════════════════════════ */

interface AgentsListProps {
  onStatsChange?: () => void
}

/* ═══════════════════════════════════════
   Agent MiniChart 辅助函数
   ═══════════════════════════════════════ */

function buildCommissionTrend(agent: Agent): MiniChartDataPoint[] {
  const points: MiniChartDataPoint[] = []
  const total = Number(agent.totalCommission || 0)
  const settled = Number(agent.settledCommission || 0)
  const pending = Number(agent.pendingWithdraw || 0)
  if (total > 0 || settled > 0 || pending > 0) {
    if (total > 0) points.push({ value: total, label: '总佣金' })
    if (settled > 0) points.push({ value: settled, label: '已结算' })
    if (pending > 0) points.push({ value: pending, label: '待提现' })
  }
  // 至少一条数据
  if (points.length === 0) {
    points.push({ value: 0.001, label: '暂无' })
  }
  return points
}

/* ═══════════════════════════════════════
   Agents List
   ═══════════════════════════════════════ */

export default function AgentsList({ onStatsChange }: AgentsListProps) {
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

  const totalPages = useMemo(() => Math.ceil(total / pageSize), [total, pageSize])

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

  const handleRefresh = useCallback(() => {
    fetchAgents()
  }, [fetchAgents])

  const handleCreated = useCallback(() => {
    setShowCreate(false)
    fetchAgents()
    onStatsChange?.()
  }, [fetchAgents, onStatsChange])

  const handleEdited = useCallback(() => {
    setEditingAgent(null)
    fetchAgents()
    onStatsChange?.()
  }, [fetchAgents, onStatsChange])

  const handleDeleted = useCallback(() => {
    setDeletingAgent(null)
    fetchAgents()
    onStatsChange?.()
  }, [fetchAgents, onStatsChange])

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
          <span className="text-sm font-medium text-slate-700">
            代理列表
            {total > 0 && <span className="text-slate-400 ml-1">（共 {total} 个）</span>}
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleRefresh}
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
                <th className="px-4 py-3 text-sm font-medium text-slate-500">佣金趋势</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <TableSkeleton rows={5} cols={10} />
              ) : agents.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-400">
                    暂无代理数据
                  </td>
                </tr>
              ) : (
                agents.map((a) => (
                  <AgentRow
                    key={a.id}
                    agent={a}
                    onDetail={(id) => navigate(`/admin/agents/${id}/detail`)}
                    onClients={(id) => navigate(`/admin/agents/${id}/clients`)}
                    onEdit={setEditingAgent}
                    onDelete={setDeletingAgent}
                  />
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
      {showCreate && <CreateAgentModal onClose={handleCreated} />}

      {/* Edit Agent Modal */}
      {editingAgent && (
        <EditAgentModal agent={editingAgent} onClose={handleEdited} />
      )}

      {/* Delete Agent Modal */}
      {deletingAgent && (
        <DeleteAgentModal agent={deletingAgent} onClose={handleDeleted} />
      )}
    </>
  )
}

/* ═══════════════════════════════════════
   Agent Row — 单行渲染 + MiniChart
   ═══════════════════════════════════════ */

function AgentRow({
  agent,
  onDetail,
  onClients,
  onEdit,
  onDelete,
}: {
  agent: Agent
  onDetail: (id: number) => void
  onClients: (id: number) => void
  onEdit: (agent: Agent) => void
  onDelete: (agent: Agent) => void
}) {
  const trendData = useMemo(() => buildCommissionTrend(agent), [agent])

  return (
    <tr className="hover:bg-slate-50 transition">
      <td className="px-4 py-3 text-sm text-slate-600">{agent.id}</td>
      <td className="px-4 py-3 text-sm text-slate-900">{agent.email || '-'}</td>
      <td className="px-4 py-3 text-sm text-slate-600">{agent.nickname || '-'}</td>
      <td className="px-4 py-3 text-sm">
        <button
          onClick={() => onDetail(agent.id)}
          className="text-indigo-600 hover:text-indigo-800 font-medium"
        >
          详情页 &gt;
        </button>
      </td>
      <td className="px-4 py-3 text-sm font-medium">
        ¥{Number(agent.totalCommission || 0).toFixed(2)}
      </td>
      <td className="px-4 py-3 text-sm font-medium text-orange-600">
        ¥{Number(agent.pendingWithdraw || 0).toFixed(2)}
      </td>
      <td className="px-4 py-3">
        <MiniChart
          data={trendData}
          type="bar"
          width={80}
          height={28}
          color="#818cf8"
          gradient={false}
        />
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
            agent.status
              ? 'bg-green-100 text-green-700'
              : 'bg-slate-100 text-slate-500'
          }`}
        >
          {agent.status ? '启用' : '禁用'}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
        {agent.createdAt
          ? new Date(agent.createdAt).toLocaleDateString('zh-CN')
          : '-'}
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button
            onClick={() => onDetail(agent.id)}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            详情
          </button>
          <button
            onClick={() => onEdit(agent)}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            编辑
          </button>
          <button
            onClick={() => onClients(agent.id)}
            className="text-sm text-purple-600 hover:text-purple-800"
          >
            客户
          </button>
          <button
            onClick={() => onDelete(agent)}
            className="text-sm text-red-600 hover:text-red-800"
          >
            <Trash2 size={14} className="inline" />
            删除
          </button>
        </div>
      </td>
    </tr>
  )
}

/* ═══════════════════════════════════════
   Create Agent Modal
   ═══════════════════════════════════════ */

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
    const body: Record<string, any> = { userId: uid }
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

/* ═══════════════════════════════════════
   Edit Agent Modal
   ═══════════════════════════════════════ */

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

/* ═══════════════════════════════════════
   Delete Agent Modal
   ═══════════════════════════════════════ */

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
