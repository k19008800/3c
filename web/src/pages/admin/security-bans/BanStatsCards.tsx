import { useMemo } from 'react'
import { Ban, ShieldOff, UserX } from 'lucide-react'
import type { BanList } from '@/types'
import type { BanStats } from './types'

interface Props {
  data: BanList | null
}

function MiniChart({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
      />
    </div>
  )
}

export default function BanStatsCards({ data }: Props) {
  const stats: BanStats = useMemo(() => ({
    ipCount: data?.ipBans.length ?? 0,
    userCount: data?.userBans.length ?? 0,
    total: (data?.ipBans.length ?? 0) + (data?.userBans.length ?? 0),
  }), [data])

  if (!data) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* Total */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
        <div className="rounded-full bg-indigo-100 p-2.5">
          <Ban size={20} className="text-indigo-600" />
        </div>
        <div>
          <p className="text-xs text-slate-500">总封禁数</p>
          <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
        </div>
      </div>

      {/* IP Bans */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
        <div className="rounded-full bg-orange-100 p-2.5">
          <ShieldOff size={20} className="text-orange-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-500">IP 封禁</p>
          <p className="text-2xl font-bold text-slate-900">{stats.ipCount}</p>
        </div>
        <MiniChart value={stats.ipCount} max={stats.total} color="#f97316" />
      </div>

      {/* User Bans */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
        <div className="rounded-full bg-red-100 p-2.5">
          <UserX size={20} className="text-red-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-500">用户封禁</p>
          <p className="text-2xl font-bold text-slate-900">{stats.userCount}</p>
        </div>
        <MiniChart value={stats.userCount} max={stats.total} color="#ef4444" />
      </div>
    </div>
  )
}
