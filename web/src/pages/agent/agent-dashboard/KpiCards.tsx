import { useMemo } from 'react'
import { Users, DollarSign, Wallet, Percent } from 'lucide-react'
import { fmt2, type KpiCardsProps } from './types'

/**
 * 关键指标卡片 — 展示名下客户数、累计佣金、可提现余额、分佣比例
 *
 * 【状态覆盖】
 *  - 正常渲染：4 张卡片
 *  - commissionRate 为 0/未配置：显示 "未配置" + 灰色样式
 *  - data 由 parent 守卫，不可能为 null
 */
export default function KpiCards({ data }: KpiCardsProps) {
  const cards = useMemo(
    () => [
      {
        label: '名下客户',
        value: data.totalClients,
        icon: Users,
        color: 'text-blue-600',
        bg: 'bg-blue-50',
      },
      {
        label: '累计佣金',
        value: `¥${fmt2(data.totalCommission)}`,
        icon: DollarSign,
        color: 'text-green-600',
        bg: 'bg-green-50',
      },
      {
        label: '可提现余额',
        value: `¥${fmt2(data.availableBalance)}`,
        icon: Wallet,
        color: 'text-orange-600',
        bg: 'bg-orange-50',
      },
      {
        label: '分佣比例',
        value:
          data.commissionRate && Number(data.commissionRate) > 0
            ? `${(Number(data.commissionRate) * 100).toFixed(1)}%`
            : '未配置',
        icon: Percent,
        color:
          data.commissionRate && Number(data.commissionRate) > 0
            ? 'text-purple-600'
            : 'text-slate-400',
        bg:
          data.commissionRate && Number(data.commissionRate) > 0
            ? 'bg-purple-50'
            : 'bg-slate-50',
      },
    ],
    [data],
  )

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-white rounded-xl p-4 shadow-sm border border-slate-200"
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${card.bg}`}>
              <card.icon size={20} className={card.color} />
            </div>
            <div>
              <p className="text-xs text-slate-500">{card.label}</p>
              <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
