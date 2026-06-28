import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { FinanceDashboard } from '@/types'
import {
  Loader2, AlertCircle, DollarSign, Users, RefreshCw,
  ClipboardList, ShieldCheck, TrendingUp,
} from 'lucide-react'

function fmt(v: string | number | null | undefined, digits = 2): string {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0
  return `¥${n.toFixed(digits)}`
}

export default function AdminFinanceDashboard() {
  const [data, setData] = useState<FinanceDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await get<FinanceDashboard>('/api/v1/admin/finance/dashboard')
      setData(res)
    } catch (err: any) {
      setError(err.message || '获取财务数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg text-sm">
        <AlertCircle size={18} />
        {error}
        <button onClick={fetchData} className="ml-2 px-3 py-1 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700">重试</button>
      </div>
    )
  }

  const d = data!

  // 待处理总计
  const totalPendingCount = d.pendingFirstReview.count + d.pendingSecondReview.count + d.pendingRecharge.count
  const totalPendingAmount =
    parseFloat(d.pendingFirstReview.totalAmount) +
    parseFloat(d.pendingSecondReview.totalAmount) +
    parseFloat(d.pendingRecharge.totalAmount)

  const cards = [
    {
      label: '待初审提现',
      value: `${d.pendingFirstReview.count} 笔`,
      sub: fmt(d.pendingFirstReview.totalAmount),
      icon: ClipboardList,
      color: 'text-amber-600 bg-amber-50',
    },
    {
      label: '待复审提现',
      value: `${d.pendingSecondReview.count} 笔`,
      sub: fmt(d.pendingSecondReview.totalAmount),
      icon: ShieldCheck,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: '待处理充值',
      value: `${d.pendingRecharge.count} 笔`,
      sub: fmt(d.pendingRecharge.totalAmount),
      icon: DollarSign,
      color: 'text-orange-600 bg-orange-50',
    },
    d.pendingCommissions && {
      label: '待结算佣金',
      value: `${d.pendingCommissions.count} 笔`,
      sub: fmt(d.pendingCommissions.totalAmount),
      icon: DollarSign,
      color: 'text-orange-600 bg-orange-50',
    },
    {
      label: '今日已打款',
      value: `${d.todayPaidWithdraws.count} 笔`,
      sub: fmt(d.todayPaidWithdraws.totalAmount),
      icon: TrendingUp,
      color: 'text-green-600 bg-green-50',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">财务工作台</h1>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition"
        >
          <RefreshCw size={15} /> 刷新
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.filter(Boolean).map((card) => (
          <div key={card.label} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 mb-1">{card.label}</p>
                <p className="text-2xl font-bold text-slate-900">{card.value}</p>
                <p className="text-sm text-slate-500 mt-1">{card.sub}</p>
              </div>
              <div className={`p-2.5 rounded-lg ${card.color}`}>
                <card.icon size={20} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users size={18} className="text-orange-600" />
            <h2 className="text-base font-semibold text-slate-800">待处理汇总</h2>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-orange-50 rounded-lg p-4 text-center">
              <p className="text-xs text-slate-500 mb-1">待处理笔数</p>
              <p className="text-2xl font-bold text-orange-600">{totalPendingCount}</p>
            </div>
            <div className="bg-orange-50 rounded-lg p-4 text-center">
              <p className="text-xs text-slate-500 mb-1">待处理金额</p>
              <p className="text-lg font-bold text-orange-600">{fmt(totalPendingAmount)}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <p className="text-xs text-slate-500 mb-1">今日已打款</p>
              <p className="text-lg font-bold text-blue-600">{fmt(d.todayPaidWithdraws.totalAmount)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-blue-600" />
            <h2 className="text-base font-semibold text-slate-800">快速入口</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <a href="/admin/recharge-orders" className="bg-blue-50 hover:bg-blue-100 rounded-lg p-4 text-center transition">
              <p className="text-sm font-medium text-blue-700">充值订单</p>
            </a>
            <a href="/admin/finance/commissions" className="bg-violet-50 hover:bg-violet-100 rounded-lg p-4 text-center transition">
              <p className="text-sm font-medium text-violet-700">佣金流水</p>
            </a>
            <a href="/admin/finance/reconciliation" className="bg-emerald-50 hover:bg-emerald-100 rounded-lg p-4 text-center transition">
              <p className="text-sm font-medium text-emerald-700">对账报表</p>
            </a>
            <a href="/admin/withdraws" className="bg-rose-50 hover:bg-rose-100 rounded-lg p-4 text-center transition">
              <p className="text-sm font-medium text-rose-700">提现管理</p>
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
