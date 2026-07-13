import { useState, useEffect, useCallback } from 'react'
import { get } from '@/lib/api'
import {
  BarChart3, TrendingUp, PiggyBank, DollarSign,
  Loader2, AlertCircle, RefreshCw, Search
} from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'

// ── Types (matches backend) ──

interface CostOverview {
  period: string
  totalCost: string
  adminCost: string
  agentCost: string
  subsidyAmount: string
  subsidyRatio: number
  adminVsAgent: {
    admin: { cost: string; subsidy: string; revenue: string; netEffect: string }
    agent: { cost: string; subsidy: string; revenue: string; netEffect: string }
  }
  platformTotalCost: number
  platformSubsidy: number
  revenueAttributed: number
  roi: number
  source: string
}

interface CostDetailItem {
  campaignId?: number
  campaignName?: string
  batchName?: string
  batchId?: number
  count?: number
  issuedCount: number
  usedCount: number
  totalFaceValue: number
  costAmount: number
  subsidyAmount: number
  usageRate?: number
}

// ── Helpers ──

function fmt2(n: number | string): string {
  const v = typeof n === 'string' ? parseFloat(n) : n
  return `¥${(v / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

const MONTH_OPTIONS = (() => {
  const now = new Date()
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: `${d.getFullYear()}年${d.getMonth() + 1}月`,
    }
  })
})()

export default function CodeCostDashboard() {
  const [overview, setOverview] = useState<CostOverview | null>(null)
  const [details, setDetails] = useState<CostDetailItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState('2026-07')
  const [activeTab, setActiveTab] = useState<'overview' | 'admin' | 'agent'>('overview')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // Always fetch overview
      const ov = await get<CostOverview>('/api/v1/admin/finance/codes/cost-overview', { period })
      setOverview(ov)

      // Fetch details based on active tab
      if (activeTab === 'admin' || activeTab === 'agent') {
        const type = activeTab as string
        const res = await get<{ list: CostDetailItem[] }>(
          `/api/v1/admin/finance/codes/cost-detail/${type}`,
          { period }
        )
        setDetails(res?.list || [])
      }
    } catch (err: any) {
      setError(err.message || '获取成本数据失败')
    } finally {
      setLoading(false)
    }
  }, [period, activeTab])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BarChart3 size={28} className="text-indigo-600" />
          <h1 className="text-2xl font-bold text-slate-900">兑换码成本看板</h1>
          <FeatureDescription page="admin/finance/code-cost" className="ml-2" />
        </div>
        <div className="flex items-center gap-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {MONTH_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition">
            <RefreshCw size={15} /> 刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Loading */}
      {loading && !overview && (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-indigo-500" size={28} />
        </div>
      )}

      {overview && (
        <>
          {/* Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <p className="text-xs text-slate-500 mb-1">平台总成本</p>
              <p className="text-2xl font-bold text-slate-900">{fmt2(overview.totalCost)}</p>
              <p className="text-xs text-slate-400 mt-1">数据源: {overview.source}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <p className="text-xs text-slate-500 mb-1">Admin成本</p>
              <p className="text-2xl font-bold text-indigo-600">{fmt2(overview.adminCost)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <p className="text-xs text-slate-500 mb-1">Agent成本</p>
              <p className="text-2xl font-bold text-amber-600">{fmt2(overview.agentCost)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <p className="text-xs text-slate-500 mb-1">平台补贴</p>
              <p className="text-2xl font-bold text-rose-600">{fmt2(overview.subsidyAmount)}</p>
              <p className="text-xs text-slate-400 mt-1">补贴率 {fmtPct(overview.subsidyRatio)}</p>
            </div>
          </div>

          {/* Admin vs Agent comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-indigo-200 p-5">
              <h3 className="text-sm font-semibold text-indigo-700 mb-3">Admin 成本结构</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">成本</span><span className="font-mono text-indigo-600">{fmt2(overview.adminVsAgent.admin.cost)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">补贴</span><span className="font-mono text-rose-600">{fmt2(overview.adminVsAgent.admin.subsidy)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">净支出</span><span className="font-mono text-slate-700">{fmt2(overview.adminVsAgent.admin.netEffect)}</span></div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-amber-200 p-5">
              <h3 className="text-sm font-semibold text-amber-700 mb-3">Agent 成本结构</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">成本</span><span className="font-mono text-amber-600">{fmt2(overview.adminVsAgent.agent.cost)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">补贴</span><span className="font-mono text-rose-600">{fmt2(overview.adminVsAgent.agent.subsidy)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">净支出</span><span className="font-mono text-slate-700">{fmt2(overview.adminVsAgent.agent.netEffect)}</span></div>
              </div>
            </div>
          </div>

          {/* Tab: Detail */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
            {(['overview', 'admin', 'agent'] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${activeTab === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {t === 'overview' ? '总览' : t === 'admin' ? 'Admin明细' : 'Agent明细'}
              </button>
            ))}
          </div>

          {/* Detail Table */}
          {activeTab !== 'overview' && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-indigo-500" size={24} /></div>
              ) : details.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">暂无明细数据</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-4 py-2.5 font-medium text-slate-500">{activeTab === 'admin' ? '活动' : '代理'}</th>
                      <th className="px-4 py-2.5 font-medium text-slate-500 text-right">发放数</th>
                      <th className="px-4 py-2.5 font-medium text-slate-500 text-right">使用数</th>
                      <th className="px-4 py-2.5 font-medium text-slate-500 text-right">面值</th>
                      <th className="px-4 py-2.5 font-medium text-slate-500 text-right">成本</th>
                      <th className="px-4 py-2.5 font-medium text-slate-500 text-right">补贴</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {details.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{item.campaignName || item.batchName || '-'}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{item.issuedCount.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{item.usedCount.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700">{fmt2(item.totalFaceValue)}</td>
                        <td className="px-4 py-3 text-right font-mono text-indigo-600">{fmt2(item.costAmount)}</td>
                        <td className="px-4 py-3 text-right font-mono text-rose-600">{fmt2(item.subsidyAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {!loading && !overview && !error && (
        <div className="py-16 text-center text-slate-400 text-sm">暂无数据</div>
      )}
    </div>
  )
}
