import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Loader2, Search, Activity, TrendingUp, Zap, DollarSign, TrendingDown,
  BarChart3, AlertCircle, Building2, Wallet,
} from 'lucide-react'
import type { EnterpriseOverview as OverviewType, TopConsumer, DaySeries, EnterpriseUser } from './types'
import { fmt, fmtCompact, CHART_TOOLTIP_STYLE, DATE_RANGES } from './types'
import { StatCard } from './shared'

interface Props {
  overview: OverviewType | null
  topConsumers: TopConsumer[]
  enterpriseTrend: DaySeries[] | null
  dateRangeButtons: React.ReactNode
  onSelectEnterprise: (user: EnterpriseUser) => void
}

export default function EnterpriseOverviewPanel({ overview, topConsumers, enterpriseTrend, dateRangeButtons, onSelectEnterprise }: Props) {
  return (
    <div className="space-y-6">
      {/* 概览卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Building2 size={15} />} label="企业总数" value={overview ? String(overview.totalEnterprises) : '—'} sub={overview ? `本月新增 ${overview.monthNewEnterprises} 家` : ''} color="text-blue-600" />
        <StatCard icon={<Wallet size={15} />} label="企业总余额" value={overview ? `¥${fmt(overview.totalBalance)}` : '—'} color="text-emerald-600" />
        <StatCard icon={<Activity size={15} />} label="月活跃企业" value={overview ? String(overview.activeEnterprises) : '—'} sub={overview && overview.totalEnterprises > 0 ? `活跃率 ${(overview.activeEnterprises / overview.totalEnterprises * 100).toFixed(1)}%` : ''} color="text-violet-600" />
        <StatCard icon={<AlertCircle size={15} />} label="低余额企业" value={overview ? String(overview.lowBalanceEnterpriseCount) : '—'} sub={overview && overview.lowBalanceEnterpriseCount > 0 ? '余额 < ¥10' : ''} color="text-amber-600" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<TrendingUp size={15} />} label="本月企业总消费" value={overview ? `¥${fmt(overview.monthConsumption.totalCost)}` : '—'} sub={overview ? `${fmtCompact(overview.monthConsumption.totalCalls)} 次调用` : ''} color="text-orange-600" />
        <StatCard icon={<Zap size={15} />} label="本月企业 Token" value={overview ? `${fmtCompact(overview.monthConsumption.totalTokens)}` : '—'} color="text-purple-600" />
        <StatCard icon={<DollarSign size={15} />} label="本月企业充值" value={overview ? `¥${fmt(overview.monthRecharge.total)}` : '—'} sub={overview ? `${overview.monthRecharge.count} 笔` : ''} color="text-emerald-600" />
        <StatCard icon={<TrendingDown size={15} />} label="昨日消费" value={overview ? `¥${fmt(overview.yesterdayConsumption)}` : '—'} color="text-sky-600" />
      </div>

      {/* 企业整体趋势 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2"><BarChart3 size={16} className="text-slate-600" /><h3 className="text-sm font-semibold text-slate-800">企业整体趋势</h3></div>
          {dateRangeButtons}
        </div>
        <div className="p-5">
          {!enterpriseTrend ? (
            <div className="h-[260px] flex items-center justify-center text-sm text-slate-400"><Loader2 className="animate-spin mr-2" size={16} />加载中...</div>
          ) : enterpriseTrend.length === 0 ? (
            <div className="h-[260px] flex items-center justify-center text-sm text-slate-400">暂无数据</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={enterpriseTrend.map(d => ({ date: d.date.slice(5), calls: d.calls.total, tokens: Math.round(d.calls.totalTokens / 10000), cost: parseFloat(d.calls.totalCost) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#bbb" />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="#bbb" />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="#bbb" />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="calls" stroke="#0984e3" strokeWidth={2.5} dot={false} name="企业调用量" />
                  <Line yAxisId="right" type="monotone" dataKey="tokens" stroke="#6c5ce7" strokeWidth={2.5} strokeDasharray="5 3" dot={false} name="Token(万)" />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex gap-4 text-xs text-slate-500 mt-2">
                <span><span className="inline-block w-3 h-0.5 bg-blue-500 align-middle mr-1" /> 企业调用量</span>
                <span><span className="inline-block w-3 h-0.5 bg-violet-500 align-middle mr-1" style={{ borderTop: '2px dashed #6c5ce7', height: 0 }} /> Token 消耗</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 企业消费排行 Top 10 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2"><BarChart3 size={16} className="text-slate-600" /><h3 className="text-sm font-semibold text-slate-800">企业消费排行 Top 10</h3></div>
        </div>
        <div className="overflow-x-auto">
          {topConsumers.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">暂无数据</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="text-left px-4 py-3 font-medium w-10">#</th>
                  <th className="text-left px-4 py-3 font-medium">企业名称</th>
                  <th className="text-right px-4 py-3 font-medium">本月消费</th>
                  <th className="text-right px-4 py-3 font-medium">累计消费</th>
                  <th className="text-right px-4 py-3 font-medium">调用量</th>
                  <th className="text-right px-4 py-3 font-medium">余额</th>
                  <th className="text-center px-4 py-3 font-medium">类型</th>
                </tr>
              </thead>
              <tbody>
                {topConsumers.map((c, i) => (
                  <tr key={c.userId} className="border-b border-slate-50 hover:bg-slate-50 transition cursor-pointer"
                    onClick={() => onSelectEnterprise({ id: c.userId, email: c.email, nickname: c.nickname, companyName: c.companyName, balance: c.balance, lastLoginAt: null, status: null })}>
                    <td className="px-4 py-3 text-xs text-slate-400">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{c.companyName || c.nickname || c.email}</td>
                    <td className="px-4 py-3 text-right text-emerald-600 font-medium">¥{fmt(c.monthConsumption)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">¥{fmt(c.totalConsumption)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{fmtCompact(c.totalCalls)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">¥{fmt(c.balance)}</td>
                    <td className="px-4 py-3 text-center"><span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">企业</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 低余额企业预警 */}
      {overview && overview.lowBalanceEnterpriseList && overview.lowBalanceEnterpriseList.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-amber-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-amber-100 bg-amber-50/50 flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-amber-800">低余额企业预警</h3>
            <span className="text-xs text-amber-600 ml-auto">{overview.lowBalanceEnterpriseCount} 家余额 &lt; ¥10</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-amber-100 text-xs text-amber-600">
                  <th className="text-left px-4 py-3 font-medium">企业名称</th>
                  <th className="text-left px-4 py-3 font-medium">邮箱</th>
                  <th className="text-right px-4 py-3 font-medium">余额</th>
                  <th className="text-right px-4 py-3 font-medium">最近活跃</th>
                </tr>
              </thead>
              <tbody>
                {overview.lowBalanceEnterpriseList.map(u => (
                  <tr key={u.id} className="border-b border-amber-50 hover:bg-amber-50/50 transition cursor-pointer"
                    onClick={() => onSelectEnterprise({ id: u.id, email: u.email, nickname: u.nickname, companyName: u.companyName, balance: u.balance, lastLoginAt: u.lastLoginAt, status: 'active' })}>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{u.companyName || u.nickname || u.email}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-500">{u.email}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-sm font-semibold text-red-500">¥{fmt(u.balance)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-slate-400">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="text-center py-6">
        <div className="inline-flex items-center gap-2 text-sm text-slate-400 bg-slate-50 px-4 py-2 rounded-full"><Search size={14} />在上方搜索框输入企业名称或邮箱，查看详细分析</div>
      </div>
    </div>
  )
}
