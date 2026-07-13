import { useEffect, useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import type { BanList } from '@/types'
import {
  Loader2, AlertCircle, Lock, Unlock, RefreshCw,
  ShieldOff, UserX, Clock, Plus, X
} from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'

export default function AdminSecurityBans() {
  const [banData, setBanData] = useState<BanList | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [banning, setBanning] = useState<string | null>(null)

  // 手动封禁弹窗
  const [showBanIpDialog, setShowBanIpDialog] = useState(false)
  const [showBanUserDialog, setShowBanUserDialog] = useState(false)
  const [banIp, setBanIp] = useState('')
  const [banUserId, setBanUserId] = useState('')
  const [banDuration, setBanDuration] = useState(60)
  const [banReason, setBanReason] = useState('')

  const fetchBans = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<BanList>('/api/v1/admin/security/bans')
      setBanData(data)
    } catch (err: any) {
      setError(err.message || '获取封禁列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchBans() }, [fetchBans])

  const handleUnbanIp = async (ip: string) => {
    setBanning(`ip:${ip}`)
    try {
      await post('/api/v1/admin/security/unban/ip', { ip })
      fetchBans()
    } catch (err: any) {
      setError(err.message || '解封失败')
    } finally {
      setBanning(null)
    }
  }

  const handleUnbanUser = async (userId: number) => {
    setBanning(`user:${userId}`)
    try {
      await post('/api/v1/admin/security/unban/user', { userId })
      fetchBans()
    } catch (err: any) {
      setError(err.message || '解封失败')
    } finally {
      setBanning(null)
    }
  }

  const handleBanIp = async () => {
    if (!banIp.trim()) return
    setBanning(`ban-ip`)
    try {
      await post('/api/v1/admin/security/bans/ip', {
        ip: banIp.trim(),
        durationMinutes: banDuration,
      })
      setShowBanIpDialog(false)
      setBanIp('')
      setBanDuration(60)
      fetchBans()
    } catch (err: any) {
      setError(err.message || '封禁失败')
    } finally {
      setBanning(null)
    }
  }

  const handleBanUser = async () => {
    const uid = parseInt(banUserId, 10)
    if (!uid) return
    setBanning(`ban-user`)
    try {
      await post('/api/v1/admin/security/bans/user', {
        userId: uid,
        durationMinutes: banDuration,
        reason: banReason,
      })
      setShowBanUserDialog(false)
      setBanUserId('')
      setBanDuration(1440)
      setBanReason('')
      fetchBans()
    } catch (err: any) {
      setError(err.message || '封禁失败')
    } finally {
      setBanning(null)
    }
  }

  const formatRemaining = (ms: number) => {
    if (ms <= 0) return '即将解封'
    const mins = Math.ceil(ms / 60000)
    if (mins >= 1440) return `${Math.floor(mins / 1440)}天${mins % 1440 > 0 ? `${mins % 1440}小时` : ''}`
    if (mins >= 60) return `${Math.floor(mins / 60)}小时${mins % 60}分钟`
    return `${mins}分钟`
  }

  if (loading && !banData) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Lock size={24} /> 封禁管理
        </h1>
        <FeatureDescription page="admin/security/bans" className="ml-2" />
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBanIpDialog(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-100 transition"
          >
            <Plus size={14} /> 封禁 IP
          </button>
          <button
            onClick={() => setShowBanUserDialog(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition"
          >
            <UserX size={14} /> 封禁用户
          </button>
          <button
            onClick={fetchBans}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-slate-50 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition"
          >
            <RefreshCw size={14} /> 刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* IP 封禁列表 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 bg-orange-50 border-b border-orange-100">
          <h2 className="font-semibold text-orange-800 flex items-center gap-2">
            <ShieldOff size={16} /> IP 封禁 ({banData?.ipBans.length ?? 0})
          </h2>
        </div>
        {banData?.ipBans.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-slate-400">
            <Unlock size={32} className="mb-2 text-green-400" />
            <p className="text-sm">当前无被封禁的 IP</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3">IP 地址</th>
                  <th className="px-4 py-3">剩余时间</th>
                  <th className="px-4 py-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {banData?.ipBans.map((ban) => (
                  <tr key={ban.ip} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-mono text-slate-700">{ban.ip}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {formatRemaining(ban.remainingMs)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleUnbanIp(ban.ip)}
                        disabled={banning === `ip:${ban.ip}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded-md hover:bg-green-100 disabled:opacity-50 transition"
                      >
                        {banning === `ip:${ban.ip}` ? (
                          <Loader2 className="animate-spin" size={12} />
                        ) : (
                          <Unlock size={12} />
                        )}
                        解封
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 用户封禁列表 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 bg-red-50 border-b border-red-100">
          <h2 className="font-semibold text-red-800 flex items-center gap-2">
            <UserX size={16} /> 用户封禁 ({banData?.userBans.length ?? 0})
          </h2>
        </div>
        {banData?.userBans.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-slate-400">
            <Unlock size={32} className="mb-2 text-green-400" />
            <p className="text-sm">当前无被封禁的用户</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3">用户 ID</th>
                  <th className="px-4 py-3">邮箱</th>
                  <th className="px-4 py-3">昵称</th>
                  <th className="px-4 py-3">剩余时间</th>
                  <th className="px-4 py-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {banData?.userBans.map((ban) => (
                  <tr key={ban.userId} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-mono text-slate-700">#{ban.userId}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{ban.email ?? '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{ban.nickname ?? '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {formatRemaining(ban.remainingMs)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleUnbanUser(ban.userId)}
                        disabled={banning === `user:${ban.userId}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded-md hover:bg-green-100 disabled:opacity-50 transition"
                      >
                        {banning === `user:${ban.userId}` ? (
                          <Loader2 className="animate-spin" size={12} />
                        ) : (
                          <Unlock size={12} />
                        )}
                        解封
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 封禁 IP 弹窗 */}
      {showBanIpDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <ShieldOff size={18} /> 手动封禁 IP
              </h3>
              <button onClick={() => setShowBanIpDialog(false)} className="p-1 hover:bg-slate-100 rounded">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">IP 地址</label>
                <input
                  type="text"
                  value={banIp}
                  onChange={(e) => setBanIp(e.target.value)}
                  placeholder="如 192.168.1.1"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">封禁时长（分钟，1~1440）</label>
                <input
                  type="number"
                  value={banDuration}
                  onChange={(e) => setBanDuration(Math.max(1, Math.min(1440, parseInt(e.target.value) || 1)))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowBanIpDialog(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                取消
              </button>
              <button
                onClick={handleBanIp}
                disabled={banning === 'ban-ip' || !banIp.trim()}
                className="px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition flex items-center gap-1"
              >
                {banning === 'ban-ip' ? <Loader2 className="animate-spin" size={14} /> : <Lock size={14} />}
                确认封禁
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 封禁用户弹窗 */}
      {showBanUserDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <UserX size={18} /> 手动封禁用户
              </h3>
              <button onClick={() => setShowBanUserDialog(false)} className="p-1 hover:bg-slate-100 rounded">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">用户 ID</label>
                <input
                  type="number"
                  value={banUserId}
                  onChange={(e) => setBanUserId(e.target.value)}
                  placeholder="输入用户数字 ID"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">封禁时长（分钟，1~43200，默认24小时）</label>
                <input
                  type="number"
                  value={banDuration}
                  onChange={(e) => setBanDuration(Math.max(1, Math.min(43200, parseInt(e.target.value) || 1)))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">封禁原因（可选）</label>
                <input
                  type="text"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="如：异常调用、恶意刷单"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowBanUserDialog(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                取消
              </button>
              <button
                onClick={handleBanUser}
                disabled={banning === 'ban-user' || !parseInt(banUserId)}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition flex items-center gap-1"
              >
                {banning === 'ban-user' ? <Loader2 className="animate-spin" size={14} /> : <Lock size={14} />}
                确认封禁
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
