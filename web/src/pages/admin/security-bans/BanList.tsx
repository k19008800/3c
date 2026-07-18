import { useCallback } from 'react'
import { ShieldOff, UserX, Unlock, Clock, Loader2 } from 'lucide-react'
import type { BanList } from '@/types'

interface Props {
  data: BanList | null
  banning: string | null
  onUnbanIp: (ip: string) => void
  onUnbanUser: (userId: number) => void
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '即将解封'
  const mins = Math.ceil(ms / 60000)
  if (mins >= 1440) return `${Math.floor(mins / 1440)}天${mins % 1440 > 0 ? `${mins % 1440}小时` : ''}`
  if (mins >= 60) return `${Math.floor(mins / 60)}小时${mins % 60}分钟`
  return `${mins}分钟`
}

function IpBanTable({ bans, banning, onUnbanIp }: {
  bans: BanList['ipBans']
  banning: string | null
  onUnbanIp: (ip: string) => void
}) {
  if (bans.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 text-slate-400">
        <Unlock size={32} className="mb-2 text-green-400" />
        <p className="text-sm">当前无被封禁的 IP</p>
      </div>
    )
  }

  return (
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
          {bans.map((ban) => (
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
                  onClick={() => onUnbanIp(ban.ip)}
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
  )
}

function UserBanTable({ bans, banning, onUnbanUser }: {
  bans: BanList['userBans']
  banning: string | null
  onUnbanUser: (userId: number) => void
}) {
  if (bans.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 text-slate-400">
        <Unlock size={32} className="mb-2 text-green-400" />
        <p className="text-sm">当前无被封禁的用户</p>
      </div>
    )
  }

  return (
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
          {bans.map((ban) => (
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
                  onClick={() => onUnbanUser(ban.userId)}
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
  )
}

export default function BanList({ data, banning, onUnbanIp, onUnbanUser }: Props) {
  if (!data) return null

  return (
    <>
      {/* IP 封禁列表 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 bg-orange-50 border-b border-orange-100">
          <h2 className="font-semibold text-orange-800 flex items-center gap-2">
            <ShieldOff size={16} /> IP 封禁 ({data.ipBans.length})
          </h2>
        </div>
        <IpBanTable bans={data.ipBans} banning={banning} onUnbanIp={onUnbanIp} />
      </div>

      {/* 用户封禁列表 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 bg-red-50 border-b border-red-100">
          <h2 className="font-semibold text-red-800 flex items-center gap-2">
            <UserX size={16} /> 用户封禁 ({data.userBans.length})
          </h2>
        </div>
        <UserBanTable bans={data.userBans} banning={banning} onUnbanUser={onUnbanUser} />
      </div>
    </>
  )
}
