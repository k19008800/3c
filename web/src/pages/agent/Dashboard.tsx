import { useEffect, useState } from 'react'
import { get } from '@/lib/api'
import type { AgentDashboard } from '@/types'
import { Loader2, Users, DollarSign, Wallet, Percent, RefreshCw } from 'lucide-react'

export default function AgentDashboard() {
  const [data, setData] = useState<AgentDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await get<AgentDashboard>('/api/v1/agent/dashboard')
      setData(res)
    } catch (err: any) {
      setError(err.message || '获取面板数据失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
        {error}
      </div>
    )
  }

  if (!data) return null

  const cards = [
    {
      label: '名下客户',
      value: data.totalClients,
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: '累计佣金',
      value: `¥${Number(data.totalCommission).toFixed(2)}`,
      icon: DollarSign,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: '可提现余额',
      value: `¥${Number(data.availableBalance).toFixed(2)}`,
      icon: Wallet,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
    {
      label: '分佣比例',
      value: `${(Number(data.commissionRate) * 100).toFixed(1)}%`,
      icon: Percent,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">代理商面板</h1>
        <button
          onClick={fetchData}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
        >
          <RefreshCw size={14} />
          刷新
        </button>
      </div>

      {/* Stats cards */}
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

      {/* Recent commission */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-700">最近佣金</h2>
        </div>
        {data.recentCommissions.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-400">暂无佣金记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">ID</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">调用成本</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">佣金金额</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.recentCommissions.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm text-slate-600">{c.id}</td>
                    <td className="px-4 py-3 text-sm">¥{Number(c.callCost).toFixed(4)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-green-600">
                      ¥{Number(c.commissionAmount).toFixed(4)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          c.status === 'settled'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}
                      >
                        {c.status === 'settled' ? '已结算' : '待结算'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {new Date(c.createdAt).toLocaleString('zh-CN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
