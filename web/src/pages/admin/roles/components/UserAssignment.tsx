import { useState, useEffect } from 'react'
import { UserPlus, UserMinus, Search } from 'lucide-react'
import type { UserInRole, CandidateUser } from '../types'

interface UserAssignmentProps {
  roleId: number | null
  users: UserInRole[]
  candidates: CandidateUser[]
  loading: boolean
  onFetchCandidates: (kw: string) => void
  onAssign: (userId: number) => void
  onRemove: (userId: number) => void
}

export default function UserAssignment({
  roleId,
  users,
  candidates,
  loading,
  onFetchCandidates,
  onAssign,
  onRemove,
}: UserAssignmentProps) {
  const [keyword, setKeyword] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    if (showAdd && keyword) {
      onFetchCandidates(keyword)
    }
  }, [showAdd, keyword, onFetchCandidates])

  if (!roleId) return null

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
        <h3 className="font-semibold">用户分配</h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-slate-50"
        >
          <UserPlus size={14} />
          添加用户
        </button>
      </div>

      {/* Add user panel */}
      {showAdd && (
        <div className="p-4 border-b bg-slate-50">
          <div className="flex gap-2 mb-2">
            <Search size={16} className="text-slate-400 mt-2" />
            <input
              type="text"
              placeholder="搜索用户..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="flex-1 px-2 py-1 text-sm border rounded"
            />
          </div>
          {candidates.length > 0 && (
            <div className="space-y-1">
              {candidates.slice(0, 5).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-2 hover:bg-white rounded"
                >
                  <div>
                    <div className="text-sm">{c.email}</div>
                    {c.nickname && <div className="text-xs text-slate-600">{c.nickname}</div>}
                  </div>
                  <button
                    onClick={() => { onAssign(c.id); setShowAdd(false) }}
                    className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                  >
                    <UserPlus size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* User list */}
      <div className="divide-y">
        {loading ? (
          <div className="p-4 text-center text-slate-500">加载中...</div>
        ) : users.length === 0 ? (
          <div className="p-4 text-center text-slate-500">暂无用户</div>
        ) : (
          users.map((u) => (
            <div key={u.userId} className="p-4 flex items-center justify-between">
              <div>
                <div className="text-sm">{u.email}</div>
                {u.nickname && <div className="text-xs text-slate-600">{u.nickname}</div>}
              </div>
              <button
                onClick={() => onRemove(u.userId)}
                className="p-1 text-slate-400 hover:text-red-600"
              >
                <UserMinus size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}