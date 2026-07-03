import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { get } from '@/lib/api'
import type { SecurityDashboardData, SecurityEvent } from '@/types'
import RiskBadge from '@/components/security/RiskBadge'
import {
  Loader2, AlertCircle, ShieldAlert, AlertTriangle, Lock,
  CircuitBoard, TrendingUp, ArrowRight, CheckCircle2
} from 'lucide-react'

const eventTypeLabels: Record<string, string> = {
  brute_force: '暴力破解', unusual_location: '异地登录', new_device: '新设备',
  ip_banned: 'IP封禁', user_banned: '账号封禁', user_captcha: '验证码挑战',
  circuit_trip: '厂商熔断', circuit_recovery: '熔断恢复', vendor_failure: '厂商失败',
}

export default function AdminSecurityDashboard() {
  const [data, setData] = useState<SecurityDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await get<SecurityDashboardData>('/api/v1/admin/security/dashboard')
      setData(res)
    } catch (err: any) {
      setError(err.message || '获取安全总览失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg">
        <AlertCircle size={16} /> {error}
      </div>
    )
  }

  if (!data) return null

  const { stats, riskDistribution, typeDistribution, trend, recentEvents } = data

  const totalEvents = trend.reduce((s, d) => s + d.total, 0)
  const totalHigh = trend.reduce((s, d) => s + d.critical + d.high, 0)

  const statCards = [
    {
      icon: AlertTriangle, label: '未处理高危', value: stats.unacknowledgedHighRisk,
      color: stats.unacknowledgedHighRisk > 0 ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50',
      border: stats.unacknowledgedHighRisk > 0 ? 'border-red-200' : 'border-green-200',
      link: '/admin/security/events?acknowledged=false&riskLevel=high',
    },
    {
      icon: Lock, label: '封禁IP', value: stats.bannedIps,
      color: 'text-orange-600 bg-orange-50', border: 'border-orange-200',
      link: '/admin/security/bans',
    },
    {
      icon: Lock, label: '封禁用户', value: stats.bannedUsers,
      color: stats.bannedUsers > 0 ? 'text-amber-600 bg-amber-50' : 'text-slate-500 bg-slate-50',
      border: stats.bannedUsers > 0 ? 'border-amber-200' : 'border-slate-200',
      link: '/admin/security/bans',
    },
    {
      icon: CircuitBoard, label: '活跃熔断', value: stats.activeCircuits,
      color: stats.activeCircuits > 0 ? 'text-purple-600 bg-purple-50' : 'text-slate-500 bg-slate-50',
      border: stats.activeCircuits > 0 ? 'border-purple-200' : 'border-slate-200',
      link: '/admin/security/events?eventType=circuit_trip',
    },
  ]

  // 7 天趋势最大高度
  const maxTrend = Math.max(...trend.map(d => d.total), 1)

  // 事件类型分布 Top 5
  const topTypes = typeDistribution.slice(0, 6)
  const maxTypeCount = Math.max(...topTypes.map(t => t.count), 1)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ShieldAlert size={24} /> 安全总览
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">
            <span className="font-semibold text-slate-600">{totalEvents}</span> 近7天事件 ·
            <span className={`font-semibold ${totalHigh > 0 ? 'text-red-600' : 'text-green-600'}`}> {totalHigh}</span> 高危
          </span>
        </div>
      </div>

      {/* 4 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Link
            key={card.label}
            to={card.link}
            className={`bg-white rounded-xl p-4 border ${card.border} shadow-sm hover:shadow-md transition cursor-pointer`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`p-2 rounded-lg ${card.color}`}>
                <card.icon size={20} />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900">{card.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{card.label}</div>
          </Link>
        ))}
      </div>

      {/* 趋势图 + 分布 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 7 天趋势柱状图 */}
        <div className="lg:col-span-2 bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1">
            <TrendingUp size={16} /> 近7天安全事件趋势
          </h3>
          {trend.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-slate-400">暂无数据</div>
          ) : (
            <div className="flex items-end gap-2 h-32">
              {trend.map((d) => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col-reverse" style={{ height: `${Math.max((d.total / maxTrend) * 100, 4)}%` }}>
                    <div className="w-full flex flex-col-reverse rounded-t">
                      {d.critical > 0 && (
                        <div
                          className="w-full bg-red-500 rounded-t"
                          style={{ height: `${(d.critical / d.total) * 100}%` }}
                          title={`严重: ${d.critical}`}
                        />
                      )}
                      {d.high > 0 && (
                        <div
                          className="w-full bg-orange-400"
                          style={{ height: `${(d.high / d.total) * 100}%` }}
                          title={`高危: ${d.high}`}
                        />
                      )}
                      {d.medium > 0 && (
                        <div
                          className="w-full bg-yellow-400"
                          style={{ height: `${(d.medium / d.total) * 100}%` }}
                          title={`中危: ${d.medium}`}
                        />
                      )}
                      {d.low > 0 && (
                        <div
                          className="w-full bg-blue-400"
                          style={{ height: `${(d.low / d.total) * 100}%` }}
                          title={`低危: ${d.low}`}
                        />
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500">{d.date}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500" /> 严重</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-orange-400" /> 高危</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-yellow-400" /> 中危</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-400" /> 低危</span>
          </div>
        </div>

        {/* 事件类型分布 */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">事件类型分布</h3>
          {typeDistribution.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-slate-400">暂无数据</div>
          ) : (
            <div className="space-y-2">
              {topTypes.map((t) => {
                const pct = (t.count / maxTypeCount) * 100
                return (
                  <div key={t.eventType}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="text-slate-600 truncate">{eventTypeLabels[t.eventType] || t.eventType}</span>
                      <span className="text-slate-400 font-mono">{t.count}</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 风险等级分布 */}
      {riskDistribution.length > 0 && (
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">近7天风险等级分布</h3>
          <div className="flex gap-4">
            {['critical', 'high', 'medium', 'low'].map((level) => {
              const item = riskDistribution.find(r => r.riskLevel === level)
              const count = item?.count ?? 0
              const pct = totalEvents > 0 ? (count / totalEvents * 100).toFixed(1) : '0'
              const colors: Record<string, string> = {
                critical: 'text-red-600 bg-red-50 border-red-200',
                high: 'text-orange-600 bg-orange-50 border-orange-200',
                medium: 'text-yellow-600 bg-yellow-50 border-yellow-200',
                low: 'text-blue-600 bg-blue-50 border-blue-200',
              }
              const labels: Record<string, string> = {
                critical: '严重', high: '高危', medium: '中危', low: '低危',
              }
              return (
                <div key={level} className={`flex-1 p-3 rounded-lg border ${colors[level]}`}>
                  <div className="text-lg font-bold">{count}</div>
                  <div className="text-xs">{labels[level]}</div>
                  <div className="text-[10px] opacity-60">{pct}%</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 最近事件 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">最近未确认事件</h3>
          <Link
            to="/admin/security/events?acknowledged=false"
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            查看全部 <ArrowRight size={12} />
          </Link>
        </div>
        <div className="divide-y divide-slate-100">
          {recentEvents.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-slate-400">
              <CheckCircle2 size={32} className="mb-2 text-green-400" />
              <p className="text-sm">暂无未处理的安全事件</p>
            </div>
          ) : (
            recentEvents.map((ev: SecurityEvent) => (
              <div key={ev.id} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50">
                <RiskBadge level={ev.riskLevel} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-slate-800">
                    {eventTypeLabels[ev.eventType] || ev.eventType}
                  </span>
                  <span className="text-xs text-slate-400 ml-2">
                    {ev.userId ? `用户 #${ev.userId}` : ''}
                    {ev.ip ? ` · ${ev.ip}` : ''}
                  </span>
                </div>
                <span className="text-xs text-slate-400 shrink-0">
                  {new Date(ev.createdAt).toLocaleString('zh-CN')}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
