import { useEffect, useState, useCallback } from 'react'
import { get, post, patch, del } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import type { TeamInfo, TeamMemberInfo } from '@/types'
import {
  Loader2, AlertCircle, Users, UserPlus, Trash2,
  ShieldCheck, Shield, User, X, Plus, LogOut,
} from 'lucide-react'

// ── Helpers ──

const roleLabel: Record<string, string> = {
  team_owner: '团队所有者',
  team_admin: '团队管理员',
  team_member: '成员',
}
const roleColor: Record<string, string> = {
  team_owner: 'bg-purple-100 text-purple-700',
  team_admin: 'bg-blue-100 text-blue-700',
  team_member: 'bg-slate-100 text-slate-700',
}
const roleIcon: Record<string, React.ReactNode> = {
  team_owner: <ShieldCheck size={14} />,
  team_admin: <Shield size={14} />,
  team_member: <User size={14} />,
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return '-'
  try { return new Date(v).toLocaleString('zh-CN') } catch { return v }
}

export default function Team() {
  const { user } = useAuth()
  const [teamInfo, setTeamInfo] = useState<TeamInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Create team form
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [creating, setCreating] = useState(false)

  // Invite modal
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'team_admin' | 'team_member'>('team_member')
  const [inviting, setInviting] = useState(false)

  // Confirm remove
  const [confirmRemove, setConfirmRemove] = useState<TeamMemberInfo | null>(null)
  const [removing, setRemoving] = useState(false)

  // Role change
  const [changingRole, setChangingRole] = useState<number | null>(null)

  const fetchTeam = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<TeamInfo>('/api/v1/team')
      setTeamInfo(data)
    } catch (err: any) {
      // 404/400 = 没有团队 — 不显示错误，让用户创建
      if (err.message?.includes('不在') || err.message?.includes('不存在')) {
        setTeamInfo(null)
      } else {
        setError(err.message || '获取团队信息失败')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTeam() }, [fetchTeam])

  const handleCreateTeam = async () => {
    if (!createName.trim()) return
    setCreating(true)
    setError('')
    try {
      const data = await post<TeamInfo>('/api/v1/team', { name: createName.trim() })
      setTeamInfo(data)
      setShowCreate(false)
      setCreateName('')
      setCreateDesc('')
    } catch (err: any) {
      setError(err.message || '创建团队失败')
    } finally {
      setCreating(false)
    }
  }

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return
    setInviting(true)
    setError('')
    try {
      await post('/api/v1/team/invite', { email: inviteEmail.trim(), role: inviteRole })
      setShowInvite(false)
      setInviteEmail('')
      setInviteRole('team_member')
      fetchTeam()
    } catch (err: any) {
      setError(err.message || '邀请失败')
    } finally {
      setInviting(false)
    }
  }

  const handleRemove = async (target: TeamMemberInfo) => {
    setRemoving(true)
    setError('')
    try {
      await del(`/api/v1/team/members/${target.userId}`)
      setConfirmRemove(null)
      fetchTeam()
    } catch (err: any) {
      setError(err.message || '移除成员失败')
    } finally {
      setRemoving(false)
    }
  }

  const handleChangeRole = async (userId: number, role: string) => {
    setChangingRole(userId)
    setError('')
    try {
      await patch(`/api/v1/team/members/${userId}`, { role })
      fetchTeam()
    } catch (err: any) {
      setError(err.message || '修改角色失败')
    } finally {
      setChangingRole(null)
    }
  }

  const handleLeave = async () => {
    setLoading(true)
    setError('')
    try {
      await post('/api/v1/team/leave', {})
      setTeamInfo(null)
      fetchTeam()
    } catch (err: any) {
      setError(err.message || '退出团队失败')
      setLoading(false)
    }
  }

  const isOwner = user?.teamRole === 'team_owner'
  const isAdmin = user?.teamRole === 'team_admin'
  const canManage = isOwner || isAdmin

  // Loading
  if (loading && !teamInfo) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users size={28} className="text-blue-600" />
          <h1 className="text-2xl font-bold text-slate-900">团队管理</h1>
        </div>
        {teamInfo && canManage && (
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <UserPlus size={15} /> 邀请成员
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {!teamInfo ? (
        /* ── 无团队 → 创建表单 ── */
        <div className="bg-white rounded-xl p-8 shadow-sm border border-slate-200 text-center">
          <Users size={48} className="mx-auto text-slate-300" />
          <h2 className="text-xl font-semibold text-slate-900 mt-4">创建您的团队</h2>
          <p className="text-slate-500 mt-2 mb-6">邀请成员一起管理 API 配额与权限</p>

          <div className="max-w-sm mx-auto space-y-4 text-left">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">团队名称 *</label>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="输入团队名称"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">团队描述</label>
              <textarea
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                placeholder="团队描述（选填）"
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none"
              />
            </div>
            <button
              onClick={handleCreateTeam}
              disabled={creating || !createName.trim()}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              {creating && <Loader2 className="animate-spin" size={18} />}
              <Plus size={16} /> 创建团队
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ── 团队信息卡片 ── */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  团队 #{teamInfo.teamId}
                </h2>
                <p className="text-slate-500 text-sm mt-1">
                  {teamInfo.memberCount} 名成员
                </p>
              </div>
              {!isOwner && (
                <button
                  onClick={handleLeave}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition"
                >
                  <LogOut size={14} /> 退出团队
                </button>
              )}
            </div>
          </div>

          {/* ── 成员列表 ── */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">成员列表</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">邮箱</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">昵称</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">角色</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">加入时间</th>
                    {canManage && <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {teamInfo.members.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 text-sm text-slate-900">{m.email}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{m.nickname || '-'}</td>
                      <td className="px-4 py-3">
                        {canManage && m.role !== 'team_owner' ? (
                          <div className="relative inline-block">
                            <select
                              value={m.role}
                              onChange={(e) => handleChangeRole(m.userId, e.target.value)}
                              disabled={changingRole === m.userId}
                              className={`appearance-none inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border-0 cursor-pointer ${roleColor[m.role] || ''}`}
                            >
                              <option value="team_admin">团队管理员</option>
                              <option value="team_member">成员</option>
                            </select>
                            {changingRole === m.userId && (
                              <Loader2 size={12} className="animate-spin absolute -right-4 top-1/2 -translate-y-1/2" />
                            )}
                          </div>
                        ) : (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${roleColor[m.role] || 'bg-slate-100 text-slate-700'}`}>
                            {roleIcon[m.role]} {roleLabel[m.role] || m.role}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{fmtDate(m.joinedAt)}</td>
                      {canManage && (
                        <td className="px-4 py-3">
                          {m.role !== 'team_owner' && (
                            <button
                              onClick={() => setConfirmRemove(m)}
                              className="text-sm text-red-600 hover:text-red-800 flex items-center gap-1"
                            >
                              <Trash2 size={14} /> 移除
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── 邀请成员弹窗 ── */}
      {showInvite && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) setShowInvite(false) }}
        >
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <UserPlus size={20} /> 邀请成员
                </h2>
                <button onClick={() => setShowInvite(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">邮箱 *</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="输入成员邮箱"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">角色</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'team_admin' | 'team_member')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                >
                  <option value="team_member">成员</option>
                  <option value="team_admin">团队管理员</option>
                </select>
              </div>

              <button
                onClick={handleInvite}
                disabled={inviting || !inviteEmail.trim()}
                className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
              >
                {inviting && <Loader2 className="animate-spin" size={18} />}
                发送邀请
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 移除确认弹窗 ── */}
      {confirmRemove && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmRemove(null) }}
        >
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">确认移除</h2>
                <button onClick={() => setConfirmRemove(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
              </div>
              <p className="text-sm text-slate-600">
                确定将 <strong>{confirmRemove.email}</strong> 移出团队吗？此操作不可撤销。
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmRemove(null)}
                  className="flex-1 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition text-sm"
                >
                  取消
                </button>
                <button
                  onClick={() => handleRemove(confirmRemove)}
                  disabled={removing}
                  className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition flex items-center justify-center gap-2 text-sm"
                >
                  {removing && <Loader2 className="animate-spin" size={16} />}
                  确认移除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
