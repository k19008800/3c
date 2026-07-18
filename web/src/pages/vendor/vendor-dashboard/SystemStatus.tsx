import { useMemo } from 'react'
import type { VendorHealthItem } from './types'

interface Props {
  items: VendorHealthItem[]
  loading?: boolean
}

function HealthRow({ item }: { item: VendorHealthItem }) {
  const score = Number(item.healthScore || 0)
  const scoreColor = score >= 90 ? 'text-green-600' : score >= 70 ? 'text-amber-600' : 'text-red-600'

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-2.5 font-medium text-slate-700">{item.modelName}</td>
      <td className="px-4 py-2.5 font-mono text-slate-500">{item.upstreamModelName}</td>
      <td className="px-4 py-2.5 text-center">
        {item.isDown
          ? <span className="text-red-600 font-medium">宕机</span>
          : item.status
            ? <span className="text-green-600">正常</span>
            : <span className="text-slate-400">禁用</span>}
      </td>
      <td className={`px-4 py-2.5 text-right font-mono font-bold ${scoreColor}`}>{score.toFixed(1)}</td>
      <td className="px-4 py-2.5 text-right text-slate-500">{item.healthSamples ?? '-'}</td>
      <td className="px-4 py-2.5 text-right text-slate-500">{item.consecutiveSuccess ?? '-'}</td>
      <td className="px-4 py-2.5 text-slate-400">
        {item.lastHealthCheckAt ? new Date(item.lastHealthCheckAt).toLocaleString('zh-CN') : '-'}
      </td>
    </tr>
  )
}

export default function SystemStatus({ items, loading }: Props) {
  const rows = useMemo(() => items, [items])

  if (loading) return null

  if (rows.length === 0) {
    return <div className="text-center py-12 text-slate-400 text-sm">暂无健康数据</div>
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 text-left">
            <th className="px-4 py-2.5 font-medium text-slate-500">模型</th>
            <th className="px-4 py-2.5 font-medium text-slate-500">上游名称</th>
            <th className="px-4 py-2.5 font-medium text-slate-500 text-center">状态</th>
            <th className="px-4 py-2.5 font-medium text-slate-500 text-right">健康分</th>
            <th className="px-4 py-2.5 font-medium text-slate-500 text-right">采样数</th>
            <th className="px-4 py-2.5 font-medium text-slate-500 text-right">连续成功</th>
            <th className="px-4 py-2.5 font-medium text-slate-500">最近检测</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(h => (
            <HealthRow key={h.vendorModelId} item={h} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
