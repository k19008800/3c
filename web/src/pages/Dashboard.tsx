import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import QuickConnectPanel from '@/components/portal/QuickConnectPanel'
import {
  Loader2, DollarSign, Activity, Cpu, Wallet, Key, FileText, AlertCircle, Shield,
  CheckCircle2, XCircle, Gauge, Copy, Terminal, BarChart3, TrendingUp,
  PieChart, ChevronDown, ChevronRight, Clock,
} from 'lucide-react'
import { StatCard } from './dashboard/components/StatCard'
import { useDashboard } from './dashboard/hooks/useDashboard'
import { TIME_RANGE_LABELS } from './dashboard/constants'
import { fmtCost, fmtTokens, pct } from './dashboard/utils'
import type { TimeRange } from './dashboard/types'

export default function Dashboard() {
  const { user } = useAuth()
  const [timeRange, setTimeRange] = useState<TimeRange>('today')
  const [curlCopied, setCurlCopied] = useState(false)
  const curlTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 清理 setTimeout
  useEffect(() => {
    return () => {
      if (curlTimeoutRef.current) clearTimeout(curlTimeoutRef.current)
    }
  }, [])

  const {
    summary,
    loading,
    error,
    loginHistory,
    quota,
    quotaLoading,
    usageOpen,
    setUsageOpen,
    usageTab,
    setUsageTab,
    aggStats,
    aggDaily,
    aggModels,
    aggLoading,
    keyActivities,
    keyActivityLoading,
    apiKeyList,
  } = useDashboard(timeRange)

  const handleCopyCurl = async () => {
    const activeApiKey = keyActivities.find((k) => k.keyPrefix)
    const keyDisplay = activeApiKey
      ? activeApiKey.keyPrefix + '...'
      : 'YOUR_API_KEY'

    const curlCmd = `curl -X POST https://api.unmisa.com/v1/chat/completions \\
  -H "Authorization: Bearer ${keyDisplay}" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "Hello"}]}'`

    try {
      await navigator.clipboard.writeText(curlCmd)
      setCurlCopied(true)
      if (curlTimeoutRef.current) clearTimeout(curlTimeoutRef.current)
      curlTimeoutRef.current = setTimeout(() => setCurlCopied(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = curlCmd
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCurlCopied(true)
      if (curlTimeoutRef.current) clearTimeout(curlTimeoutRef.current)
      curlTimeoutRef.current = setTimeout(() => setCurlCopied(false), 2000)
    }
  }

  // ── Daily 7-day bars for trends tab ──
  const trendDays = aggDaily.length > 0 ? aggDaily.slice(-7) : []
  const maxTrendTokens = Math.max(1, ...trendDays.map(d => Number(d.totalTokens)))

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-6 text-white">
        <h1 className="text-2xl font-bold text-white">欢迎回来！</h1>
        <p className="mt-2 opacity-90">{user?.email}</p>
        <div className="flex gap-4 mt-3">
          <span className="bg-white/20 px-3 py-1 rounded-full text-sm">
            余额：¥{Number(user?.balance || 0).toFixed(4)}
          </span>
          <span className="bg-white/20 px-3 py-1 rounded-full text-sm">
            角色：{user?.role === 'super_admin' ? '超级管理员' : user?.role === 'admin' ? '管理员' : '用户'}
          </span>
        </div>
      </div>

      {/* Quick Connect */}
      {apiKeyList.length > 0 && (<QuickConnectPanel apiKeys={apiKeyList} baseUrl={window.location.origin} defaultModel="deepseek-chat" />)}

      {/* Time Range Toggle */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-500">统计周期：</span>
        <div className="flex bg-slate-100 rounded-lg p-1">
          {(Object.entries(TIME_RANGE_LABELS) as [TimeRange, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTimeRange(key)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
                timeRange === key
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <div className="col-span-4 flex justify-center py-12">
            <Loader2 className="animate-spin" size={32} />
          </div>
        ) : error ? (
          <div className="col-span-4 flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg">
            <AlertCircle size={18} />
            {error}
          </div>
        ) : summary ? (
          <>
            <StatCard
              icon={Activity}
              label={`${TIME_RANGE_LABELS[timeRange]}调用次数`}
              value={summary.totalCalls.toLocaleString()}
              sub={`成功 ${summary.successCalls} / 失败 ${summary.failedCalls}`}
              color="bg-blue-500"
            />
            <StatCard
              icon={Cpu}
              label={`${TIME_RANGE_LABELS[timeRange]}Token 消耗`}
              value={Number(summary.totalTokens / 10000).toFixed(2) + '万'}
              sub={Number(summary.totalTokens).toLocaleString() + ' tokens'}
              color="bg-purple-500"
            />
            <StatCard
              icon={DollarSign}
              label={`${TIME_RANGE_LABELS[timeRange]}消费`}
              value={'¥' + Number(summary.totalCost).toFixed(4)}
              color="bg-green-500"
            />
            <StatCard
              icon={Wallet}
              label="当前余额"
              value={'¥' + Number(user?.balance || 0).toFixed(4)}
              color="bg-orange-500"
            />
          </>
        ) : null}
      </div>

      {/* Quota Usage */}
      {!quotaLoading && quota && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 mb-4">
            <Gauge size={20} className="text-indigo-500" />
            <h2 className="text-lg font-semibold">额度使用情况</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">
                已用 ¥{Number(quota.usedAmount || 0).toFixed(2)} / 总额 ¥{Number(quota.quotaAmount).toFixed(2)}
              </span>
              <span className={`font-medium ${
                (quota.usagePercent ?? 0) >= 90 ? 'text-red-600' : (quota.usagePercent ?? 0) >= Number(quota.alertPercent ?? 80) ? 'text-amber-600' : 'text-green-600'
              }`}>
                {(quota.usagePercent ?? 0).toFixed(1)}%
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  (quota.usagePercent ?? 0) >= 90 ? 'bg-red-500' : (quota.usagePercent ?? 0) >= Number(quota.alertPercent ?? 80) ? 'bg-amber-500' : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(100, quota.usagePercent ?? 0)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>类型：{quota.quotaType === 'monthly' ? '月度' : '一次性'}</span>
              <span>周期：{new Date(quota.periodStart).toLocaleDateString('zh-CN')} ~ {new Date(quota.periodEnd).toLocaleDateString('zh-CN')}</span>
            </div>
            {(quota.usagePercent ?? 0) >= Number(quota.alertPercent ?? 80) && (
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 p-2 rounded-lg">
                <AlertCircle size={14} />
                额度即将用完，建议及时充值
                <Link to="/recharge" className="text-blue-600 hover:underline ml-1">去充值 →</Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 用量总览 Expandable Section ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Expand toggle header */}
        <button
          onClick={() => setUsageOpen(!usageOpen)}
          className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition text-left"
        >
          <div className="flex items-center gap-2">
            <BarChart3 size={20} className="text-blue-500" />
            <h2 className="text-lg font-semibold">用量总览</h2>
            <span className="text-xs text-slate-400 ml-1">{TIME_RANGE_LABELS[timeRange]}</span>
          </div>
          <div className="flex items-center gap-2">
            {keyActivities.length > 0 && (
              <span className="text-xs text-slate-400">{keyActivities.length} 个密钥</span>
            )}
            {usageOpen ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
          </div>
        </button>

        {usageOpen && (
          <div className="px-6 pb-6 space-y-4 bg-gradient-to-b from-blue-50/30 to-white border-t border-blue-100">
            {/* Tab bar */}
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit mt-5">
              {([
                { k: 'overview' as const, label: '概览', icon: BarChart3 },
                { k: 'trends' as const, label: '趋势', icon: TrendingUp },
                { k: 'models' as const, label: '模型', icon: PieChart },
                { k: 'compare' as const, label: 'Key 对比', icon: Activity },
              ]).map(t => (
                <button key={t.k} onClick={() => setUsageTab(t.k)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${usageTab === t.k ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  <t.icon size={13} /> {t.label}
                </button>
              ))}
            </div>

            {aggLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={24} /></div>
            ) : (
              <>
                {/* Tab: Overview */}
                {usageTab === 'overview' && aggStats && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {([
                        { label: `${TIME_RANGE_LABELS[timeRange]}调用`, v: aggStats.totalCalls.toLocaleString(), sub: `${aggStats.successCalls} 成功 / ${aggStats.failedCalls} 失败`, color: 'border-blue-200 bg-blue-50' },
                        { label: 'Token 消耗', v: fmtTokens(aggStats.totalTokens), sub: `${TIME_RANGE_LABELS[timeRange]}总计`, color: 'border-purple-200 bg-purple-50' },
                        { label: '总消费', v: fmtCost(aggStats.totalCost), sub: `成功率 ${aggStats.successRate}%`, color: 'border-green-200 bg-green-50' },
                        { label: '活跃密钥', v: `${keyActivities.filter(k => k.callCount > 0).length}/${keyActivities.length}`, sub: '有调用 / 总数', color: 'border-amber-200 bg-amber-50' },
                      ] as const).map(c => (
                        <div key={c.label} className={`rounded-lg border p-3 ${c.color}`}>
                          <p className="text-xs text-slate-500 mb-1">{c.label}</p>
                          <p className="text-lg font-bold text-slate-800">{c.v}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">{c.sub}</p>
                        </div>
                      ))}
                    </div>

                    {/* Success rate bar */}
                    {aggStats.totalCalls > 0 && (
                      <div className="bg-white rounded-lg border border-slate-200 p-3">
                        <div className="flex justify-between text-xs mb-2">
                          <span className="text-slate-500">成功率</span>
                          <span className="font-mono font-bold text-slate-700">{aggStats.successRate}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                          <div className="bg-emerald-500 h-3 rounded-full transition-all"
                            style={{ width: `${Math.min(100, aggStats.successRate)}%` }} />
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                          <span>成功 {aggStats.successCalls}</span>
                          <span>失败 {aggStats.failedCalls}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab: Trends */}
                {usageTab === 'trends' && (
                  <div className="space-y-4">
                    <div className="bg-white rounded-lg border border-slate-200 p-4">
                      <p className="text-xs font-medium text-slate-500 mb-3">Token 消耗趋势</p>
                      {trendDays.length === 0 ? (
                        <p className="text-sm text-slate-400 py-8 text-center">暂无数据</p>
                      ) : (
                        <div className="flex items-end gap-2 h-28">
                          {trendDays.map(d => (
                            <div key={d.date} className="flex-1 flex flex-col items-center gap-1"
                              title={`${d.date}: ${d.totalCalls}次 / ${fmtTokens(Number(d.totalTokens))} / ${fmtCost(d.totalCost)}`}>
                              <span className="text-[10px] text-slate-400 font-mono">{d.totalCalls}</span>
                              <div className="w-full bg-indigo-400 rounded-t transition-all hover:bg-indigo-500"
                                style={{ height: `${Math.max(3, (Number(d.totalTokens) / maxTrendTokens) * 100)}%`, minHeight: 3 }} />
                              <span className="text-[10px] text-slate-400">{d.date.slice(5)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Daily intensity heatmap */}
                    <div className="bg-white rounded-lg border border-slate-200 p-4">
                      <p className="text-xs font-medium text-slate-500 mb-3">
                        <Clock size={12} className="inline mr-1" />每日调用热力分布
                      </p>
                      {trendDays.length === 0 ? (
                        <p className="text-sm text-slate-400 py-4 text-center">暂无数据</p>
                      ) : (() => {
                        const maxCalls = Math.max(1, ...trendDays.map(d => d.totalCalls))
                        return (
                          <div className="grid grid-cols-7 gap-px bg-slate-100 rounded-lg overflow-hidden">
                            {trendDays.map(d => {
                              const intensity = d.totalCalls / maxCalls
                              let bg = 'bg-slate-50'
                              if (intensity > 0.7) bg = 'bg-indigo-500'
                              else if (intensity > 0.4) bg = 'bg-indigo-400'
                              else if (intensity > 0.1) bg = 'bg-indigo-200'
                              return (
                                <div key={d.date} className={`${bg} p-3 text-center transition-colors`}
                                  title={`${d.date}: ${d.totalCalls}次 / ${fmtTokens(Number(d.totalTokens))}`}>
                                  <span className="text-[10px] text-slate-600 font-mono">{d.date.slice(5)}</span>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                )}

                {/* Tab: Model Breakdown */}
                {usageTab === 'models' && (
                  <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                    {aggModels.length === 0 ? (
                      <p className="p-6 text-center text-sm text-slate-400">暂无模型数据</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 text-left">
                            <th className="px-4 py-2.5 font-medium text-slate-500">模型</th>
                            <th className="px-4 py-2.5 font-medium text-slate-500 text-right">调用</th>
                            <th className="px-4 py-2.5 font-medium text-slate-500 text-right">Token</th>
                            <th className="px-4 py-2.5 font-medium text-slate-500 text-right">费用</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {aggModels.map((m, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-4 py-2.5 font-medium text-slate-700 font-mono">{m.modelName || '未知'}</td>
                              <td className="px-4 py-2.5 text-right text-slate-600">{m.totalCalls.toLocaleString()}</td>
                              <td className="px-4 py-2.5 text-right text-slate-600 font-mono">{fmtTokens(m.totalTokens)}</td>
                              <td className="px-4 py-2.5 text-right text-slate-900 font-mono font-medium">{fmtCost(m.totalCost)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* Tab: Key Comparison */}
                {usageTab === 'compare' && (
                  <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                    {keyActivityLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="animate-spin" size={20} /></div>
                    ) : keyActivities.length === 0 ? (
                      <p className="p-6 text-center text-sm text-slate-400">暂无 API 密钥</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 text-left">
                            <th className="px-4 py-2.5 font-medium text-slate-500">密钥</th>
                            <th className="px-4 py-2.5 font-medium text-slate-500 text-right">调用</th>
                            <th className="px-4 py-2.5 font-medium text-slate-500 text-right">Token</th>
                            <th className="px-4 py-2.5 font-medium text-slate-500 text-right">费用</th>
                            <th className="px-4 py-2.5 font-medium text-slate-500 text-right">成功率</th>
                            <th className="px-4 py-2.5 font-medium text-slate-500 text-right">占比</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {keyActivities.map(k => {
                            const totalTokens = keyActivities.reduce((a, b) => a + b.totalTokens, 0)
                            return (
                              <tr key={k.id} className={`hover:bg-slate-50 ${k.callCount === 0 ? 'text-slate-400' : ''}`}>
                                <td className="px-4 py-2.5 font-medium text-slate-700">
                                  {k.name || `Key #${k.id}`}
                                  <span className="ml-1 text-[10px] text-slate-400 font-mono">{k.keyPrefix}...</span>
                                </td>
                                <td className="px-4 py-2.5 text-right text-slate-600">{k.callCount.toLocaleString()}</td>
                                <td className="px-4 py-2.5 text-right text-slate-600 font-mono">{fmtTokens(k.totalTokens)}</td>
                                <td className="px-4 py-2.5 text-right text-slate-900 font-mono">{fmtCost(k.totalCost)}</td>
                                <td className="px-4 py-2.5 text-right">
                                  <span className="font-mono">{pct(k.successCount, k.callCount)}</span>
                                </td>
                                <td className="px-4 py-2.5 text-right text-slate-500 font-mono">
                                  {totalTokens > 0 ? `${((k.totalTokens / totalTokens) * 100).toFixed(0)}%` : '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {!aggStats && usageTab === 'overview' && (
                  <p className="text-sm text-slate-400 text-center py-8">暂无用量数据</p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold mb-4">快捷操作</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            to="/recharge"
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition group"
          >
            <Wallet size={24} className="text-blue-500 group-hover:scale-110 transition" />
            <div>
              <p className="font-medium text-slate-900">充值</p>
              <p className="text-sm text-slate-500">为账户充值</p>
            </div>
          </Link>
          <Link
            to="/api-keys"
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 hover:border-purple-300 hover:bg-purple-50 transition group"
          >
            <Key size={24} className="text-purple-500 group-hover:scale-110 transition" />
            <div>
              <p className="font-medium text-slate-900">API 密钥</p>
              <p className="text-sm text-slate-500">管理 API 密钥</p>
            </div>
          </Link>
          <Link
            to="/logs"
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 hover:border-green-300 hover:bg-green-50 transition group"
          >
            <FileText size={24} className="text-green-500 group-hover:scale-110 transition" />
            <div>
              <p className="font-medium text-slate-900">调用日志</p>
              <p className="text-sm text-slate-500">查看调用记录</p>
            </div>
          </Link>
          <button
            onClick={handleCopyCurl}
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 hover:border-amber-300 hover:bg-amber-50 transition group text-left"
          >
            <Terminal size={24} className="text-amber-500 group-hover:scale-110 transition" />
            <div>
              <p className="font-medium text-slate-900">
                {curlCopied ? '已复制！' : '复制 curl 命令'}
              </p>
              <p className="text-sm text-slate-500">
                {curlCopied ? '命令已复制到剪贴板' : '快速生成调用示例'}
              </p>
            </div>
            <Copy size={16} className={`ml-auto shrink-0 ${curlCopied ? 'text-green-500' : 'text-slate-300'}`} />
          </button>
        </div>
      </div>

      {/* Login History */}
      {loginHistory.length > 0 && (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={20} className="text-blue-500" />
          <h2 className="text-lg font-semibold">最近登录</h2>
          <Link to="/security" className="ml-auto text-xs text-blue-600 hover:underline">查看全部 →</Link>
        </div>
        <div className="space-y-2">
          {loginHistory.slice(0, 3).map((h) => (
            <div key={h.id} className="flex items-center gap-3 text-sm">
              {h.success
                ? <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                : <XCircle size={14} className="text-red-500 shrink-0" />
              }
              <span className="text-slate-600">
                {h.city ? `${h.city} ` : ''}
                {new Date(h.createdAt).toLocaleString('zh-CN')}
              </span>
              <span className="text-xs text-slate-400 font-mono">{h.ip}</span>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  )
}