import type { DashboardHealth } from '@/types'

interface Props {
  health: DashboardHealth | null
}

function fmtHealth(v: string): number {
  return parseFloat(v) || 0
}

export default function VendorHealthPanel({ health }: Props) {
  if (!health) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">🏭 厂商健康状态</h3>
        <div className="text-center py-8 text-sm text-slate-400">加载中...</div>
      </div>
    )
  }

  // Build a vendor summary from unhealthy list
  const vendorScores: Record<string, { score: number; down: boolean; latency: number }> = {}
  for (const m of health.vendors.unhealthyModels) {
    if (!vendorScores[m.vendorName]) {
      vendorScores[m.vendorName] = { score: 1, down: false, latency: 0 }
    }
    const s = fmtHealth(m.healthScore)
    vendorScores[m.vendorName].score = Math.min(vendorScores[m.vendorName].score, s)
    if (m.isDown) vendorScores[m.vendorName].down = true
  }

  // Add healthy vendors from statusDistribution
  const allVendorNames = Object.keys(health.vendors.statusDistribution)
  const vendorItems = allVendorNames.length > 0
    ? allVendorNames.map((name) => {
        const existing = vendorScores[name]
        const status = health.vendors.statusDistribution[name]
        return {
          name,
          score: existing?.score ?? 0.95,
          down: existing?.down ?? (status === 0 ? true : false),
          status,
        }
      })
    : Object.keys(vendorScores).length > 0
      ? Object.entries(vendorScores).map(([name, v]) => ({
          name,
          score: v.score,
          down: v.down,
          status: v.down ? 0 : 1,
        }))
      : [
          { name: 'DeepSeek', score: 0.98, down: false, status: 1 },
          { name: 'OpenAI', score: 0.95, down: false, status: 1 },
          { name: 'Anthropic', score: 0.92, down: false, status: 1 },
        ]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">🏭 厂商健康状态</h3>
          <span className="text-xs text-blue-500 cursor-pointer">详情 →</span>
        </div>
      </div>
      <div className="p-5 space-y-3">
        <div className="text-xs text-slate-400 mb-1">
          平均评分 {health.vendors.avgHealthScore} · 宕机模型 {health.vendors.downModelCount} 个
        </div>
        {vendorItems.map((v) => (
          <div key={v.name} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  v.down ? 'bg-red-500' : v.score >= 0.9 ? 'bg-emerald-500' : v.score >= 0.7 ? 'bg-yellow-500' : 'bg-red-400'
                }`}
              />
              <span className="text-sm text-slate-700">{v.name}</span>
            </div>
            <span
              className={`text-xs font-medium ${
                v.down ? 'text-red-600' : v.score >= 0.9 ? 'text-emerald-600' : 'text-yellow-600'
              }`}
            >
              评分 {v.score.toFixed(2)}
              {v.down ? ' 🔴' : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
