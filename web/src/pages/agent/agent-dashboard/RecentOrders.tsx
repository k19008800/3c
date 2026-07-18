import { useMemo } from 'react'
import { Loader2, ArrowUpRight } from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { fmt2, PIE_COLORS, PIE_FILLS, PieTooltip, type RecentOrdersProps } from './types'

/**
 * 最近订单 — 收入结构饼图 + 重点客户 TOP5
 *
 * 【状态覆盖】
 *  - loading：居中 spinner
 *  - 空/无数据：提示文案
 *  - 正常渲染：双区域（饼图 + 客户排行）
 */
export default function RecentOrders({ data, loading }: RecentOrdersProps) {
  const pieData = useMemo(
    () =>
      (data?.byType ?? [])
        .filter((t) => t.percentage > 0)
        .map((t) => ({
          name: t.type,
          label: t.label,
          value: t.percentage,
          amount: t.amount,
          count: t.count,
          percentage: t.percentage,
        })),
    [data],
  )

  const hasPieData = pieData.length > 0
  const topClients = data?.topClients ?? []
  const hasTopClients = topClients.length > 0

  return (
    <>
      {/* ════════════════════════════════════════════ */}
      {/*  收入结构饼图                                */}
      {/* ════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">收入结构</h2>
          <a
            href="/agent/commissions"
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
          >
            查看全部 <ArrowUpRight size={12} />
          </a>
        </div>
        <div className="px-2 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-36">
              <Loader2 className="animate-spin" size={20} />
            </div>
          ) : !hasPieData ? (
            <div className="text-center py-10 text-sm text-slate-400">
              暂无收入结构数据
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              {/* 饼图 */}
              <div className="h-48 w-48 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={PIE_COLORS[pieData.indexOf(entry) % PIE_COLORS.length]}
                          stroke={PIE_FILLS[pieData.indexOf(entry) % PIE_FILLS.length]}
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* 图例列表 */}
              <div className="flex-1 space-y-2.5 self-start pt-2 w-full">
                {data?.byType
                  .filter((t) => t.percentage > 0)
                  .map((t, idx: number) => (
                    <div key={t.type} className="flex items-center justify-between px-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                          style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                        />
                        <span className="text-sm text-slate-700">{t.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-slate-800">¥{fmt2(t.amount)}</span>
                        <span className="text-xs text-slate-400 min-w-[36px] text-right">
                          {t.percentage}%
                        </span>
                      </div>
                    </div>
                  ))}
                {/* 当月收入概览 */}
                {data && (
                  <div className="mt-3 pt-3 border-t border-slate-100 px-2 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      本月收入: <strong className="text-slate-700">¥{fmt2(data.monthIncome)}</strong>
                    </span>
                    <span>
                      本月笔数: <strong className="text-slate-700">{data.monthRecords}</strong>
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════ */}
      {/*  重点客户 TOP5                              */}
      {/* ════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">
            重点客户 TOP{Math.min(topClients.length, 5)}
          </h2>
          <a
            href="/agent/clients"
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
          >
            查看全部客户 <ArrowUpRight size={12} />
          </a>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-36">
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : !hasTopClients ? (
          <div className="text-center py-10 text-sm text-slate-400">
            暂无客户数据
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {topClients.map((client, idx: number) => (
              <div
                key={client.customerUserId}
                className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* 排名徽标 */}
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      idx === 0
                        ? 'bg-yellow-100 text-yellow-700'
                        : idx === 1
                          ? 'bg-slate-100 text-slate-600'
                          : idx === 2
                            ? 'bg-orange-50 text-orange-600'
                            : 'bg-slate-50 text-slate-400'
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">
                      {client.customerName || `客户#${client.customerUserId}`}
                    </p>
                    {client.orderCount > 0 && (
                      <p className="text-xs text-slate-400">
                        {client.orderCount} 笔订单
                        {client.lastOrderAt && (
                          <>
                            {' '}
                            · 最近 {new Date(client.lastOrderAt).toLocaleDateString('zh-CN')}
                          </>
                        )}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-sm font-semibold text-green-600">¥{fmt2(client.commissionAmount)}</p>
                  <p className="text-xs text-slate-400">消费 ¥{fmt2(client.totalAmount)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
