import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  Loader2, Activity, Clock, MapPin, PieChart as PieIcon,
} from 'lucide-react'
import { type ActivityData, type ModelBreakdown, CHART_TOOLTIP_STYLE } from './types'

/* ── Props ── */
interface ActivityRecordProps {
  activity: ActivityData | null
  loadingActivity: boolean
  daysRange: number
  modelBreakdown: ModelBreakdown[]
}

/* ════════════════════════════════════════
   ActivityTab
   ════════════════════════════════════════ */
export default function ActivityRecord({
  activity, loadingActivity, daysRange, modelBreakdown,
}: ActivityRecordProps) {
  const [expandedIp, setExpandedIp] = useState(false)
  const displayedIps = expandedIp
    ? (activity?.ipDistribution ?? [])
    : (activity?.ipDistribution ?? []).slice(0, 6)

  const getModelDisplay = (name: string | null) => {
    const found = modelBreakdown.find(m => m.modelName === name)
    return found?.displayName || name || 'unknown'
  }

  // 热力图 / 小时分布（useMemo 缓存）
  const { weeks, hourlyFull } = useMemo(() => {
    const days: { day: string; count: number; weekday: number; week: number }[] = []
    const now = new Date()
    const activityMap = new Map((activity?.dailyActivity ?? []).map(d => [d.day, d.count]))
    for (let i = daysRange - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      const dayStr = d.toISOString().slice(0, 10)
      days.push({
        day: dayStr.slice(5),
        count: activityMap.get(dayStr) ?? 0,
        weekday: d.getDay(),
        week: Math.floor(i / 7),
      })
    }
    const wks: { label: string; days: typeof days }[] = []
    for (let w = 0; w < Math.ceil(days.length / 7); w++) {
      const weekDays = days.slice(w * 7, (w + 1) * 7)
      wks.push({ label: weekDays[0]?.day ?? '', days: weekDays })
    }
    const hFull = Array.from({ length: 24 }, (_, i) => {
      const found = activity?.hourlyDistribution.find(h => h.hour === i)
      return { hour: i, count: found?.count ?? 0 }
    })
    return { weeks: wks, hourlyFull: hFull }
  }, [activity, daysRange])

  const totalHeatDays = useMemo(() => daysRange, [daysRange])
  const activeDays = useMemo(() =>
    (activity?.dailyActivity ?? []).filter(d => d.count > 0).length,
  [activity])

  const maxHeatCount = useMemo(() => {
    const days: number[] = []
    for (const week of weeks) {
      for (const d of week.days) days.push(d.count)
    }
    return Math.max(1, ...days)
  }, [weeks])

  const getHeatColor = (count: number) => {
    if (count === 0) return 'bg-slate-100'
    const intensity = Math.min(1, count / maxHeatCount)
    if (intensity > 0.75) return 'bg-emerald-500'
    if (intensity > 0.5) return 'bg-emerald-400'
    if (intensity > 0.25) return 'bg-emerald-300'
    return 'bg-emerald-200'
  }

  const loadingEl = (
    <div className="h-[200px] flex items-center justify-center">
      <Loader2 className="animate-spin text-slate-400" size={28} />
    </div>
  )

  const emptyEl = (
    <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">暂无活跃数据</div>
  )

  if (loadingActivity) return loadingEl
  if (!activity || (activity.dailyActivity.length === 0 && activity.hourlyDistribution.length === 0)) return emptyEl

  return (
    <div className="space-y-4">
      {/* 每日活跃热力图 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Activity size={14} /> 每日活跃热力图
          </h3>
        </div>
        <div className="p-5 overflow-x-auto">
          <div className="flex gap-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {week.days.map((d, di) => (
                  <div key={di} title={`${d.day}: ${d.count} 次调用`}
                    className={`w-4 h-4 rounded-sm ${getHeatColor(d.count)} cursor-pointer`} />
                ))}
                {week.days.length < 7 && Array.from({ length: 7 - week.days.length }).map((_, i) => (
                  <div key={`empty-${i}`} className="w-4 h-4" />
                ))}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-3 text-[10px] text-slate-400">
            <span>少</span>
            <span className="w-3 h-3 rounded-sm bg-slate-100" />
            <span className="w-3 h-3 rounded-sm bg-emerald-200" />
            <span className="w-3 h-3 rounded-sm bg-emerald-300" />
            <span className="w-3 h-3 rounded-sm bg-emerald-400" />
            <span className="w-3 h-3 rounded-sm bg-emerald-500" />
            <span>多</span>
            <span className="text-slate-300 ml-1">|</span>
            <span>近 {totalHeatDays} 天活跃日 {activeDays} 天</span>
          </div>
        </div>
      </div>

      {/* 活跃时段 + IP 分布 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 小时活跃分布 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Clock size={14} /> 活跃时段分布
            </h3>
          </div>
          <div className="p-4 h-[220px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={hourlyFull}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} stroke="#bbb" interval={2} />
                <YAxis tick={{ fontSize: 11 }} stroke="#bbb" />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="count" fill="#6c5ce7" radius={[2, 2, 0, 0]} name="调用量" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* IP 分布 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <MapPin size={14} /> IP 分布
            </h3>
          </div>
          <div className="p-4 max-h-[220px] overflow-y-auto">
            {displayedIps.length === 0 ? (
              <div className="text-center text-sm text-slate-400 py-8">暂无 IP 数据</div>
            ) : (
              <>
                {displayedIps.map((ip, i) => {
                  const total = activity?.ipDistribution.reduce((s, p) => s + p.count, 0) ?? 1
                  const pct = (ip.count / total * 100).toFixed(1)
                  const barW = Math.max(4, (ip.count / total) * 100)
                  return (
                    <div key={ip.ip || i} className="flex items-center gap-2 mb-1.5 text-xs">
                      <span className="w-28 truncate text-slate-600 font-mono" title={ip.ip ?? ''}>{ip.ip}</span>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-400 rounded-full" style={{ width: `${barW}%` }} />
                      </div>
                      <span className="w-16 text-right text-slate-500">{ip.count.toLocaleString()}</span>
                      <span className="w-10 text-right text-slate-400">{pct}%</span>
                    </div>
                  )
                })}
                {(activity?.ipDistribution.length ?? 0) > 6 && (
                  <button onClick={() => setExpandedIp(!expandedIp)}
                    className="text-xs text-blue-500 hover:text-blue-600 mt-1">
                    {expandedIp ? '收起' : `查看全部 ${activity?.ipDistribution.length ?? 0} 个 IP`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 常用模型排行 */}
      {(activity?.modelRanking.length ?? 0) > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <PieIcon size={14} /> 常用模型排行
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="text-left px-4 py-3 font-medium">#</th>
                  <th className="text-left px-4 py-3 font-medium">模型名称</th>
                  <th className="text-right px-4 py-3 font-medium">调用次数</th>
                  <th className="text-right px-4 py-3 font-medium">Token 消耗</th>
                  <th className="text-right px-4 py-3 font-medium">占比</th>
                </tr>
              </thead>
              <tbody>
                {activity!.modelRanking.map((m, i) => {
                  const total = activity!.modelRanking.reduce((s, r) => s + r.count, 0)
                  const pct = total > 0 ? ((m.count / total) * 100).toFixed(1) : '0'
                  return (
                    <tr key={m.modelName || i} className="border-b border-slate-50 hover:bg-slate-50 transition">
                      <td className="px-4 py-2.5 text-xs text-slate-400">{i + 1}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{getModelDisplay(m.modelName)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{m.count.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{(m.totalTokens / 10000).toFixed(1)}万</td>
                      <td className="px-4 py-2.5 text-right text-slate-500">{pct}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
