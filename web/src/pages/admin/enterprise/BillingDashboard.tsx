import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Loader2, DollarSign, TrendingDown, Wallet, BarChart3, TrendingUp } from 'lucide-react'
import { type FinanceData, fmt, CHART_TOOLTIP_STYLE } from './types'
import { StatCard } from './AnalysisOverview'

/* ── Props ── */
interface BillingDashboardProps {
  finance: FinanceData | null
  loadingFinance: boolean
  daysRange: number
}

/* ════════════════════════════════════════
   BillingDashboard — 财务流水 Tab
   ════════════════════════════════════════ */
export default function BillingDashboard({ finance, loadingFinance, daysRange }: BillingDashboardProps) {
  const balanceChartData = useMemo(() =>
    (finance?.balanceTrend ?? []).map(d => ({
      day: d.day.slice(5),
      balance: parseFloat(d.balance),
    })),
  [finance],
  )

  return (
    <div className="space-y-4">
      {loadingFinance ? (
        <div className="h-[200px] flex items-center justify-center">
          <Loader2 className="animate-spin text-slate-400" size={28} />
        </div>
      ) : !finance ? (
        <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">暂无财务数据</div>
      ) : (
        <>
          {/* 汇总卡片 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={<DollarSign size={14} />} label={`${daysRange} 天充值总额`}
              value={`¥${fmt(finance.summary.totalRecharge)}`}
              sub={`${finance.summary.rechargeCount} 笔`} color="text-emerald-600" />
            <StatCard
              icon={<TrendingDown size={14} />} label={`${daysRange} 天消费总额`}
              value={`¥${fmt(finance.summary.totalConsumption)}`}
              sub={`${finance.summary.callCount.toLocaleString()} 次调用`} color="text-red-500" />
            <StatCard
              icon={<Wallet size={14} />} label="净充值"
              value={`¥${fmt((parseFloat(finance.summary.totalRecharge) - parseFloat(finance.summary.totalConsumption)).toFixed(2))}`}
              color={parseFloat(finance.summary.totalRecharge) >= parseFloat(finance.summary.totalConsumption) ? 'text-blue-600' : 'text-amber-600'} />
            <StatCard
              icon={<BarChart3 size={14} />} label="充值/消费比"
              value={parseFloat(finance.summary.totalConsumption) > 0
                ? (parseFloat(finance.summary.totalRecharge) / parseFloat(finance.summary.totalConsumption)).toFixed(2)
                : '—'}
              color="text-purple-600" />
          </div>

          {/* 余额趋势 */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <TrendingUp size={14} /> 余额趋势
              </h3>
            </div>
            <div className="p-5">
              {balanceChartData.length === 0 ? (
                <div className="h-[240px] flex items-center justify-center text-sm text-slate-400">暂无数据</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={balanceChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#bbb" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#bbb" tickFormatter={(v: number) => `¥${v}`} />
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: any) => `¥${(v as number).toFixed(2)}`} />
                      <Line type="monotone" dataKey="balance" stroke="#0984e3" strokeWidth={2.5} dot={false} name="余额" />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-2">
                    <span className="inline-block w-3 h-0.5 bg-blue-500 align-middle mr-1" /> 每日余额
                    <span className="text-slate-300">|</span>
                    取每日最晚时刻余额
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 充值记录 */}
          {finance.rechargeEvents.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <DollarSign size={14} /> 充值记录
                </h3>
              </div>
              <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-slate-100 text-xs text-slate-400">
                      <th className="text-left px-4 py-3 font-medium">时间</th>
                      <th className="text-right px-4 py-3 font-medium">金额</th>
                      <th className="text-center px-4 py-3 font-medium">渠道</th>
                      <th className="text-center px-4 py-3 font-medium">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finance.rechargeEvents.map(r => (
                      <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                        <td className="px-4 py-2.5 text-slate-500 text-xs">
                          {new Date(r.time).toLocaleString('zh-CN', {
                            month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                          })}
                        </td>
                        <td className="px-4 py-2.5 text-right text-emerald-600 font-medium">+¥{fmt(r.amount)}</td>
                        <td className="px-4 py-2.5 text-center text-xs text-slate-500">{r.channel}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                            r.status === 'paid' ? 'bg-emerald-50 text-emerald-600' :
                            r.status === 'pending' ? 'bg-amber-50 text-amber-600' :
                            r.status === 'cancelled' ? 'bg-red-50 text-red-500' :
                            'bg-slate-50 text-slate-500'
                          }`}>
                            {r.status === 'paid' ? '已支付' : r.status === 'pending' ? '待支付' :
                             r.status === 'cancelled' ? '已取消' : r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 流水明细 */}
          {finance.events.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <BarChart3 size={14} /> 余额流水明细
                </h3>
                <span className="text-xs text-slate-400">{finance.events.length} 条</span>
              </div>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-slate-100 text-xs text-slate-400">
                      <th className="text-left px-4 py-3 font-medium">时间</th>
                      <th className="text-left px-4 py-3 font-medium">类型</th>
                      <th className="text-right px-4 py-3 font-medium">金额</th>
                      <th className="text-right px-4 py-3 font-medium">变更后余额</th>
                      <th className="text-left px-4 py-3 font-medium">说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finance.events.map(e => {
                      const isInflow = parseFloat(e.amount) > 0
                      return (
                        <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                          <td className="px-4 py-2.5 text-xs text-slate-500">
                            {new Date(e.time).toLocaleString('zh-CN', {
                              month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                            })}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                              e.type === 'recharge' ? 'bg-emerald-50 text-emerald-600' :
                              e.type === 'order_call' ? 'bg-red-50 text-red-500' :
                              e.type === 'admin_adjust' ? 'bg-amber-50 text-amber-600' :
                              e.type === 'commission' ? 'bg-blue-50 text-blue-600' :
                              e.type === 'withdraw' ? 'bg-purple-50 text-purple-600' :
                              'bg-slate-50 text-slate-500'
                            }`}>
                              {e.type === 'recharge' ? '充值' : e.type === 'order_call' ? '消费' :
                               e.type === 'admin_adjust' ? '调账' : e.type === 'commission' ? '佣金' :
                               e.type === 'withdraw' ? '提现' : e.type}
                            </span>
                          </td>
                          <td className={`px-4 py-2.5 text-right font-medium ${isInflow ? 'text-emerald-600' : 'text-red-500'}`}>
                            {isInflow ? '+' : ''}¥{fmt(e.amount)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-slate-700">¥{fmt(e.balanceAfter)}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[200px] truncate">{e.description || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
