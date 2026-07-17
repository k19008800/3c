// ============================================================
//  AllocationFormModal.tsx — 代理分配弹窗
// ============================================================

import { useEffect, useState } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { get, post } from '@/lib/api'

interface AllocationFormModalProps {
  campaignId: number
  onClose: () => void
  onSuccess: () => void
}

export default function AllocationFormModal({
  campaignId,
  onClose,
  onSuccess,
}: AllocationFormModalProps) {
  const [agentId, setAgentId] = useState<number | ''>('')
  const [allocated, setAllocated] = useState(0)
  const [tokenAmount, setTokenAmount] = useState(0)
  const [validDays, setValidDays] = useState(30)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [agents, setAgents] = useState<Array<{ id: number; name: string }>>([])

  useEffect(() => {
    get<{ list: Array<{ id: number; nickname: string; email: string }> }>(
      '/api/v1/admin/agents',
      { page: 1, pageSize: 200 },
    )
      .then((data) => {
        const list = (data.list || []).map((a) => ({
          id: a.id,
          name: a.nickname || a.email || `代理商 #${a.id}`,
        }))
        setAgents(list)
      })
      .catch(() => setAgents([]))
  }, [])

  const handleSubmit = async () => {
    setError('')
    if (!agentId) {
      setError('请选择代理商')
      return
    }
    if (allocated <= 0) {
      setError('分配数量必须大于 0')
      return
    }
    if (tokenAmount <= 0) {
      setError('Token 数量必须大于 0')
      return
    }
    if (validDays <= 0) {
      setError('有效期天数必须大于 0')
      return
    }

    setSaving(true)
    try {
      await post(`/api/v1/admin/campaigns/${campaignId}/allocations`, {
        agent_id: agentId,
        count: allocated,
        token_amount: tokenAmount,
        valid_days: validDays,
      })
      onSuccess()
    } catch (err: any) {
      setError(err.message || '分配失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">增加分配</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-xl"
            >
              &times;
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                代理商 <span className="text-red-500">*</span>
              </label>
              <select
                value={agentId}
                onChange={(e) =>
                  setAgentId(e.target.value ? Number(e.target.value) : '')
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">请选择代理商</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  分配数量 <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={allocated}
                  onChange={(e) => setAllocated(parseInt(e.target.value) || 0)}
                  min={1}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  Token 数量 <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={tokenAmount}
                  onChange={(e) => setTokenAmount(parseInt(e.target.value) || 0)}
                  min={1}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                有效期天数 <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={validDays}
                onChange={(e) => setValidDays(parseInt(e.target.value) || 0)}
                min={1}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? '提交中...' : '确认分配'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
