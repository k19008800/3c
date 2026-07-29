import { useEffect, useState } from 'react'
import { get } from '@/lib/api'
import { Loader2, TrendingUp, DollarSign, PieChart, BarChart3 } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'

interface VendorStat {
  name: string
  callVolume: number
  cost: number
  revenue: number
  margin: number
  costEfficiency: number
}

interface CampaignROI {
  name: string
  cost: number
  incrementalRevenue: number
  netProfit: number
  roi: number
  status: string
}

export default function CostAnalysisPage() {
  const [loading, setLoading] = useState(true)
  const [vendorData, setVendorData] = useState<VendorStat[]>([])
  const [campaignData, setCampaignData] = useState<CampaignROI[]>([])
  const [tab, setTab] = useState<'vendor' | 'campaign'>('vendor')
  const currentMonth = new Date().toISOString().slice(0, 7)

  useEffect(() => {
    Promise.all([
      get(`/api/v1/admin/finance/vendor-cost-analysis?date=${currentMonth}`),
      get(`/api/v1/admin/finance/campaign-roi?date=${currentMonth}`),
    ]).then(([v, c]) => {
      setVendorData(v.data?.vendors || [])
      setCampaignData(c.data?.campaigns || [])
    }).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-6 h-6 text-green-600" />
        <h1 className="text-2xl font-bold">成本分析</h1>
        <FeatureDescription page="成本分析与 ROI" />
      </div>

      {/* Tab */}
      <div className="flex gap-2 border-b pb-2">
        <button
          onClick={() => setTab('vendor')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium ${tab === 'vendor' ? 'bg-white border border-b-white -mb-[2px] text-green-700' : 'text-gray-500'}`}
        >
          <DollarSign className="w-4 h-4 inline mr-1" />
          供应商成本分析
        </button>
        <button
          onClick={() => setTab('campaign')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium ${tab === 'campaign' ? 'bg-white border border-b-white -mb-[2px] text-green-700' : 'text-gray-500'}`}
        >
          <BarChart3 className="w-4 h-4 inline mr-1" />
          活动 ROI 分析
        </button>
      </div>

      {tab === 'vendor' && (
        <div className="space-y-4">
          {/* 统计摘要 */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border shadow-sm p-4">
              <div className="text-xs text-gray-500">总成本</div>
              <div className="text-xl font-bold text-green-700">
                ¥{vendorData.reduce((s, v) => s + v.cost, 0).toLocaleString()}
              </div>
            </div>
            <div className="bg-white rounded-lg border shadow-sm p-4">
              <div className="text-xs text-gray-500">总营收</div>
              <div className="text-xl font-bold text-blue-700">
                ¥{vendorData.reduce((s, v) => s + v.revenue, 0).toLocaleString()}
              </div>
            </div>
            <div className="bg-white rounded-lg border shadow-sm p-4">
              <div className="text-xs text-gray-500">供应商数</div>
              <div className="text-xl font-bold">{vendorData.length}</div>
            </div>
            <div className="bg-white rounded-lg border shadow-sm p-4">
              <div className="text-xs text-gray-500">综合毛利率</div>
              <div className="text-xl font-bold text-amber-700">
                {(() => {
                  const tr = vendorData.reduce((s, v) => s + v.revenue, 0)
                  const tc = vendorData.reduce((s, v) => s + v.cost, 0)
                  return tr > 0 ? Math.round(((tr - tc) / tr) * 100) + '%' : '-'
                })()}
              </div>
            </div>
          </div>

          {/* 表格 */}
          <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">供应商</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">调用量</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">成本</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">营收</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">毛利率</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">每元产出</th>
                </tr>
              </thead>
              <tbody>
                {vendorData.map(v => (
                  <tr key={v.name} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium">{v.name}</td>
                    <td className="px-4 py-3 text-right text-sm">{(v.callVolume / 10000).toFixed(1)}万</td>
                    <td className="px-4 py-3 text-right text-sm text-red-600">¥{v.cost.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-sm text-green-600">¥{v.revenue.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-sm">
                      <span className={`font-medium ${v.margin > 50 ? 'text-green-600' : v.margin > 30 ? 'text-amber-600' : 'text-red-600'}`}>
                        {v.margin}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm">¥{v.costEfficiency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 成本占比 */}
          <div className="bg-white rounded-lg border shadow-sm p-4">
            <h3 className="font-medium mb-3">成本占比</h3>
            <div className="space-y-2">
              {(() => {
                const total = vendorData.reduce((s, v) => s + v.cost, 0)
                return vendorData.map(v => {
                  const pct = total > 0 ? Math.round((v.cost / total) * 100) : 0
                  return (
                    <div key={v.name}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{v.name}</span>
                        <span className="font-medium">{pct}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: pct > 30 ? '#ef4444' : pct > 15 ? '#f59e0b' : '#22c55e',
                          }}
                        />
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        </div>
      )}

      {tab === 'campaign' && (
        <div className="space-y-4">
          {/* 统计摘要 */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border shadow-sm p-4">
              <div className="text-xs text-gray-500">活动总成本</div>
              <div className="text-xl font-bold text-red-700">
                ¥{campaignData.reduce((s, c) => s + c.cost, 0).toLocaleString()}
              </div>
            </div>
            <div className="bg-white rounded-lg border shadow-sm p-4">
              <div className="text-xs text-gray-500">增量总营收</div>
              <div className="text-xl font-bold text-green-700">
                ¥{campaignData.reduce((s, c) => s + c.incrementalRevenue, 0).toLocaleString()}
              </div>
            </div>
            <div className="bg-white rounded-lg border shadow-sm p-4">
              <div className="text-xs text-gray-500">净收益</div>
              <div className="text-xl font-bold text-blue-700">
                ¥{(campaignData.reduce((s, c) => s + c.incrementalRevenue, 0) - campaignData.reduce((s, c) => s + c.cost, 0)).toLocaleString()}
              </div>
            </div>
            <div className="bg-white rounded-lg border shadow-sm p-4">
              <div className="text-xs text-gray-500">综合 ROI</div>
              <div className="text-xl font-bold text-purple-700">
                {(() => {
                  const tc = campaignData.reduce((s, c) => s + c.cost, 0)
                  const tr = campaignData.reduce((s, c) => s + c.incrementalRevenue, 0)
                  return tc > 0 ? Math.round(((tr - tc) / tc) * 100) + '%' : '-'
                })()}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">活动名称</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">活动成本</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">增量营收</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">净收益</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">ROI</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">状态</th>
                </tr>
              </thead>
              <tbody>
                {campaignData.map(c => (
                  <tr key={c.name} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-right text-sm">¥{c.cost.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-sm text-green-600">¥{c.incrementalRevenue.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-right text-sm font-medium ${c.netProfit > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ¥{c.netProfit.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <span className={`font-medium ${c.roi > 150 ? 'text-green-600' : c.roi > 80 ? 'text-amber-600' : 'text-red-600'}`}>
                        {c.roi}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm">
                      <span className={`px-2 py-0.5 rounded text-xs ${c.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {c.status === 'active' ? '进行中' : '已结束'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800 border border-blue-200">
        <p className="font-medium mb-1">💡 说明</p>
        <ul className="list-disc ml-4 space-y-1">
          <li>供应商成本分析：展示每个供应商的成本/营收/毛利率/成本效率</li>
          <li>活动 ROI 分析：核算运营活动的成本和增量营收产出</li>
          <li>数据来自 billing_logs 和 campaigns 的聚合统计</li>
          <li>趋势数据展示近 12 个月的变化</li>
        </ul>
      </div>
    </div>
  )
}
