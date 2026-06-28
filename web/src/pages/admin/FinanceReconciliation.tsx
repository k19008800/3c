import { useState } from 'react'
import { get } from '@/lib/api'
import type { ReconciliationReport } from '@/types'
import { Loader2, AlertCircle, FileText, DollarSign, Receipt, Percent, TrendingUp } from 'lucide-react'

function fmt(v: string | number | null | undefined, digits = 2): string {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0
  return `¥${n.toFixed(digits)}`
}

export default function AdminFinanceReconciliation() {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [report, setReport] = useState<ReconciliationReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchReport = async () => {
    if (!date) return
    setLoading(true)
    setError('')
    try {
      const res = await get<ReconciliationReport>('/api/v1/admin/finance/reconciliation', { date })
      setReport(res)
    } catch (err: any) {
      setError(err.message || '获取对账数据失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">对账报表</h1>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex items-end gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">选择日期</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button onClick={fetchReport} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition">
            {loading ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}
            生成报表
          </button>
        </div>
      </div>

      {report && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-slate-500 mb-1">佣金笔数</p>
                  <p className="text-2xl font-bold text-blue-600">{report.commission.count}</p>
                  <p className="text-sm text-slate-500 mt-1">{fmt(report.commission.totalCommission)}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600"><Percent size={20} /></div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-slate-500 mb-1">提现笔数</p>
                  <p className="text-2xl font-bold text-orange-600">{report.withdraw.count}</p>
                  <p className="text-sm text-slate-500 mt-1">{fmt(report.withdraw.totalAmount)}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-orange-50 text-orange-600"><DollarSign size={20} /></div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-slate-500 mb-1">充值确认</p>
                  <p className="text-2xl font-bold text-emerald-600">{report.recharge.count}</p>
                  <p className="text-sm text-slate-500 mt-1">{fmt(report.recharge.totalAmount)}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600"><TrendingUp size={20} /></div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-slate-500 mb-1">提现手续费</p>
                  <p className="text-2xl font-bold text-violet-600">{fmt(report.withdraw.totalFee)}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-violet-50 text-violet-600"><Receipt size={20} /></div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800">数据详情 — {report.date}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-5 py-3 text-sm font-medium text-slate-500">分类</th>
                    <th className="px-5 py-3 text-sm font-medium text-slate-500">笔数</th>
                    <th className="px-5 py-3 text-sm font-medium text-slate-500">总金额</th>
                    <th className="px-5 py-3 text-sm font-medium text-slate-500">手续费</th>
                    <th className="px-5 py-3 text-sm font-medium text-slate-500">净额</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr className="hover:bg-slate-50 transition">
                    <td className="px-5 py-3 text-sm font-medium text-slate-800">佣金</td>
                    <td className="px-5 py-3 text-sm">{report.commission.count}</td>
                    <td className="px-5 py-3 text-sm">{fmt(report.commission.totalCommission)}</td>
                    <td className="px-5 py-3 text-sm">{fmt(report.commission.totalFee)}</td>
                    <td className="px-5 py-3 text-sm font-medium text-green-600">{fmt(report.commission.totalNet)}</td>
                  </tr>
                  <tr className="hover:bg-slate-50 transition">
                    <td className="px-5 py-3 text-sm font-medium text-slate-800">提现</td>
                    <td className="px-5 py-3 text-sm">{report.withdraw.count}</td>
                    <td className="px-5 py-3 text-sm">{fmt(report.withdraw.totalAmount)}</td>
                    <td className="px-5 py-3 text-sm">{fmt(report.withdraw.totalFee)}</td>
                    <td className="px-5 py-3 text-sm font-medium text-green-600">{fmt(report.withdraw.totalActual)}</td>
                  </tr>
                  <tr className="hover:bg-slate-50 transition">
                    <td className="px-5 py-3 text-sm font-medium text-slate-800">充值确认</td>
                    <td className="px-5 py-3 text-sm">{report.recharge.count}</td>
                    <td className="px-5 py-3 text-sm">{fmt(report.recharge.totalAmount)}</td>
                    <td className="px-5 py-3 text-sm">-</td>
                    <td className="px-5 py-3 text-sm font-medium text-green-600">{fmt(report.recharge.totalAmount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!report && !loading && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <FileText size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-400 text-sm">选择日期并点击"生成报表"</p>
        </div>
      )}
    </div>
  )
}
