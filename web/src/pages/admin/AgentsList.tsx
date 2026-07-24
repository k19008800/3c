import { useEffect, useState } from 'react'
import { Loader2, AlertCircle, RefreshCw, Plus, X } from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import { AgentTable } from './agents-list/components'
import { useAgentsList } from './agents-list/hooks'
import type { AgentsListProps, Agent } from './agents-list/types'

export default function AgentsList({ onStatsChange }: AgentsListProps) {
  const { agents, total, loading, error, fetchAgents, createAgent, updateAgent, deleteAgent } = useAgentsList(onStatsChange)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [keyword, setKeyword] = useState('')
  const [editAgent, setEditAgent] = useState<Agent | null>(null)
  const [deleteAgentConfirm, setDeleteAgentConfirm] = useState<Agent | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ email: '', nickname: '', password: '' })

  useEffect(() => {
    fetchAgents({ page, pageSize, keyword })
  }, [page, pageSize, keyword, fetchAgents])

  const handleCreate = async () => {
    const a = await createAgent(createForm)
    if (a) {
      setShowCreate(false)
      setCreateForm({ email: '', nickname: '', password: '' })
      fetchAgents({ page, pageSize, keyword })
    }
  }

  const handleDelete = async () => {
    if (!deleteAgentConfirm) return
    const ok = await deleteAgent(deleteAgentConfirm.id)
    if (ok) {
      setDeleteAgentConfirm(null)
      fetchAgents({ page, pageSize, keyword })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">代理商列表</h2>
        <div className="flex gap-2">
          <button
            onClick={() => fetchAgents({ page, pageSize, keyword })}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            刷新
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={16} />
            新建
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <input
          type="text"
          placeholder="搜索邮箱/昵称..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="px-3 py-1.5 border rounded text-sm w-64"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin" size={32} />
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-16 text-slate-500">暂无代理商</div>
        ) : (
          <AgentTable
            agents={agents}
            onEdit={(a) => setEditAgent(a)}
            onDelete={(a) => setDeleteAgentConfirm(a)}
          />
        )}

        {/* Pagination */}
        <div className="border-t border-slate-200 px-4 py-3">
          <PaginationBar
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={Math.ceil(total / pageSize)}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">新建代理商</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-slate-100 rounded">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">邮箱</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">昵称</label>
                <input
                  type="text"
                  value={createForm.nickname}
                  onChange={(e) => setCreateForm({ ...createForm, nickname: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">密码</label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm border rounded-lg">
                  取消
                </button>
                <button onClick={handleCreate} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg">
                  创建
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteAgentConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold mb-4">确认删除</h3>
            <p className="text-sm text-slate-600 mb-4">
              确定删除代理商 <strong>{deleteAgentConfirm.email}</strong>？
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteAgentConfirm(null)} className="px-4 py-2 text-sm border rounded-lg">
                取消
              </button>
              <button onClick={handleDelete} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg">
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}