import { useMemo } from 'react'
import { Users, DollarSign, Wallet, Percent, TrendingUp, ShoppingCart, Clock } from 'lucide-react'
import { fmt2, type KpiCardsProps } from './types'

/**
 * 关键指标卡片 — PRD 3.3 代理端仪表盘
 * 展示：总客户数+本月新增、累计佣金、本月佣金收入、可提现余额、本月总消费、待结算
 *
 * 【PRD 规格】
 *  - 总客户数: + 本月新增
 *  - 本月总消费: 名下当月消费
 *  - 本月佣金收入: 当月产生的佣金
 *  - 待结算金额: 已产生未结算
 *  - 可提现余额
 */
export default function KpiCards({ data }: KpiCardsProps) {
  const cards = useMemo(
    () => [
      {
        label: '总客户数',
        value: String(data.totalClients),
        sub: data.newClientsThisMonth > 0 ? `本月 +${data.newClientsThisMonth}` : '',
        icon: Users,
        color: 'text-blue-600',
        bg: 'bg-blue-50',
      },
      {
        label: '本月总消费',
        value: `¥${fmt2(data.monthTotalConsumption)}`,
        sub: '',
        icon: ShoppingCart,
        color: 'text-indigo-600',
        bg: 'bg-indigo-50',
      },
      {
        label: '累计佣金',
        value: `¥${fmt2(data.totalCommission)}`,
        sub: `本月 ¥${fmt2(data.monthCommissionIncome)}`,
        icon: DollarSign,
        color: 'text-green-600',
        bg: 'bg-green-50',
      },
      {
        label: '可提现余额',
        value: `¥${fmt2(data.availableBalance)}`,
        sub: '',
        icon: Wallet,
        color: 'text-orange-600',
        bg: 'bg-orange-50',
      },
      {
        label: '待结算金额',
        value: `¥${fmt2(data.pendingSettlement)}`,
        sub: '',
        icon: Clock,
        color: 'text-amber-600',
        bg: 'bg-amber-50',
      },
      {
        label: '分佣比例',
        value:
          data.commissionRate && Number(data.commissionRate) > 0
            ? `${(Number(data.commissionRate) * 100).toFixed(1)}%`
            : '未配置',
        sub: data.agentLevel ? `等级: ${AGENT_LEVEL_LABEL[data.agentLevel as keyof typeof AGENT_LEVEL_LABEL] || data.agentLevel}` : '',
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
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-white rounded-xl p-4 shadow-sm border border-slate-200"
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${card.bg}`}>
              <card.icon size={20} className={card.color} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">{card.label}</p>
              <p className={`text-lg font-bold ${card.color} truncate`}>{card.value}</p>
              {card.sub && (
                <p className="text-xs text-slate-400 truncate">{card.sub}</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

const AGENT_LEVEL_LABEL: Record<string, string> = {
  preparatory: '预备代理',
  primary: '一级代理',
  advanced: '高级代理',
  sub: '子代理',
}
