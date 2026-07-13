import { useState } from 'react'
import { MapPin } from 'lucide-react'
import type { IPPoint } from './types'

interface Props {
  ipDistribution: IPPoint[]
}

export default function GeographicDistribution({ ipDistribution }: Props) {
  const [expandedIp, setExpandedIp] = useState(false)
  const displayedIps = expandedIp ? ipDistribution : ipDistribution.slice(0, 6)

  if (ipDistribution.length === 0) return null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><MapPin size={14} /> IP 分布</h3>
      </div>
      <div className="p-4 max-h-[220px] overflow-y-auto">
        {displayedIps.length === 0 ? (
          <div className="text-center text-sm text-slate-400 py-8">暂无 IP 数据</div>
        ) : (
          <>
            {displayedIps.map((ip, i) => {
              const total = ipDistribution.reduce((s, p) => s + p.count, 0) ?? 1
              const pct = (ip.count / total * 100).toFixed(1)
              const barW = Math.max(4, (ip.count / total) * 100)
              return (
                <div key={ip.ip || i} className="flex items-center gap-2 mb-1.5 text-xs">
                  <span className="w-28 truncate text-slate-600 font-mono" title={ip.ip ?? ''}>{ip.ip}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-400 rounded-full" style={{ width: `${barW}%` }} />
                  </div>
                  <span className="w-16 text-right text-slate-500">{ip.count.toLocaleString()}</span>
                  <span className="w-10 text-right text-slate-400">{pct}%</span>
                </div>
              )
            })}
            {ipDistribution.length > 6 && (
              <button onClick={() => setExpandedIp(!expandedIp)}
                className="text-xs text-blue-500 hover:text-blue-600 mt-1">
                {expandedIp ? '收起' : `查看全部 ${ipDistribution.length} 个 IP`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
