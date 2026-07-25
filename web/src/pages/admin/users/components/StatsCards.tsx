import React from 'react'
import { Users, CheckCircle, TrendingUp, Calendar } from 'lucide-react'

interface StatsCardsProps {
  stats: {
    totalUsers: number
    activeUsers: number
    newThisMonth: number
    newToday: number
  } | null
  loading?: boolean
}

const StatsCards: React.FC<StatsCardsProps> = ({ stats, loading = false }) => {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 animate-pulse">
            <div className="flex items-center justify-between mb-3">
              <div className="w-6 h-6 bg-slate-200 rounded"></div>
              <div className="w-16 h-4 bg-slate-200 rounded"></div>
            </div>
            <div className="space-y-2">
              <div className="w-24 h-5 bg-slate-200 rounded"></div>
              <div className="w-16 h-4 bg-slate-200 rounded"></div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const cards = [
    {
      title: '总用户数',
      value: stats.totalUsers,
      icon: Users,
      color: 'bg-blue-50 text-blue-600',
      iconColor: 'text-blue-600',
      description: '平台总注册用户'
    },
    {
      title: '活跃用户',
      value: stats.activeUsers,
      icon: CheckCircle,
      color: 'bg-green-50 text-green-600',
      iconColor: 'text-green-600',
      description: '已激活可正常使用'
    },
    {
      title: '本月新增',
      value: stats.newThisMonth,
      icon: Calendar,
      color: 'bg-purple-50 text-purple-600',
      iconColor: 'text-purple-600',
      description: '自然月累计'
    },
    {
      title: '今日新增',
      value: stats.newToday,
      icon: TrendingUp,
      color: 'bg-orange-50 text-orange-600',
      iconColor: 'text-orange-600',
      description: '今日注册用户'
    }
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <div 
            key={card.title}
            className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`p-2 rounded-lg ${card.color}`}>
                <Icon size={20} className={card.iconColor} />
              </div>
              <span className="text-sm text-slate-500">{card.description}</span>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">
                {card.value.toLocaleString()}
              </div>
              <div className="text-sm text-slate-600 mt-1">{card.title}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default StatsCards