// ═══════════════════════════════════════════════════
//  AgentInfoTab — 上级代理商信息 + 设置/更换上级弹窗
// ═══════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react'
import { get, patch } from '@/lib/api'
import {
  Loader2,
  AlertCircle,
  Link2,
  X,
} from 'lucide-react'
import type { Agent } from '@/types'

/* ═══════════════════════════════════════════════════
   Parent Agent Tab
   ═══════════════════════════════════════════════════ */

interface AgentInfoTabProps {
  agentId: number
}

export default function AgentInfoTab({ agentId }: AgentInfoTabProps) {
  const [parentAgent, setParentAgent] = useState<{
    id: number
    email: string
    nickname: string
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)

  const fetchParent = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const agentSelf = await get<Agent>(`/api/v1/admin/agents/${agentId}`)
      if (!agentSelf) {
        setError('代理商不存在')
        return
      }
      if (agentSelf.parentAgentId) {
        const parent = await get<Agent>(
          `/api/v1/admin/agents/${agentSelf.parentAgentId}`
        )
        if (parent) {
          setParentAgent({
            id: parent.id,
            email: parent.email || '',
            nickname: parent.nickname || '',
          })
        } else {
          setParentAgent({
            id: agentSelf.parentAgentId,
            email: '',
            nickname: '#ID 信息待加载',
          })
        }
      } else {
        setParentAgent(null)
      }
    } catch (err: any) {
      setError(err.message || '获取上级信息失败')
    } finally {
      setLoading(false)
    }
  }, [agentId])

  useEffect(() => {
    fetchParent()
  }, [fetchParent])

  const handleUnset = useCallback(async () => {
    try {
      await patch(`/api/v1/admin/agents/${agentId}/parent`, {
        parentAgentId: null,
      })
      setParentAgent(null)
    } catch (err: any) {
      setError(err.message || '解除上级失败')
    }
  }, [agentId])

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-6">
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm mb-4">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin" size={24} />
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-slate-700 mb-1">
                当前上级代理商
              </h3>
              {parentAgent ? (
                <div className="flex items-center justify-between bg-slate-50 rounded-lg p-4">
                  <div>
                    <p className="font-medium text-slate-800">
                      #{parentAgent.id} · {parentAgent.nickname || '-'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {parentAgent.email || '-'}
                    </p>
                  </div>
                  <button
                    onClick={handleUnset}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition"
                  >
                    <X size={14} />
                    解除上级
                  </button>
                </div>
              ) : (
                <div className="bg-slate-50 rounded-lg p-4 text-center">
                  <p className="text-sm text-slate-400 mb-3">无上级代理商</p>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              <Link2 size={14} />
              {parentAgent ? '更换上级' : '设置上级'}
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <SetParentModal
          agentId={agentId}
          onClose={() => {
            setShowModal(false)
            fetchParent()
          }}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   Set Parent Modal
   ═══════════════════════════════════════════════════ */

interface SetParentModalProps {
  agentId: number
  onClose: () => void
}

function SetParentModal({ agentId, onClose }: SetParentModalProps) {
  const [parentAgentId, setParentAgentId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = useCallback(async () => {
    const pid = parseInt(parentAgentId)
    if (!pid || pid <= 0 || pid === agentId) {
      setMessage('请输入有效的代理商ID（不能为自身）')
      return
    }
    setSubmitting(true)
    setMessage('')
    try {
      await patch(`/api/v1/admin/agents/${agentId}/parent`, {
        parentAgentId: pid,
      })
      onClose()
    } catch (err: any) {
      setMessage(err.message || '设置上级失败')
    } finally {
      setSubmitting(false)
    }
  }, [parentAgentId, agentId, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">设置上级代理商</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-xl"
            >
              &times;
            </button>
          </div>

          <p className="text-xs text-slate-400">
            输入上级代理商的
            ID。设置后，该上级将获得团队佣金分成（如果已配置 team 类型的佣金规则）。
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
            <label className="block text-sm text-slate-700 mb-1">
              上级代理商 ID <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="1"
              value={parentAgentId}
              onChange={(e) => setParentAgentId(e.target.value)}
              placeholder="输入上级代理商的 ID"
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
              确认设置
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
