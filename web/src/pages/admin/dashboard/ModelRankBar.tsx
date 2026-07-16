interface Props {
  models: Array<{ modelName: string; total: number; totalTokens: number }>
  title?: string
}

const modelColors = [
  'linear-gradient(90deg,#0984e3,#74b9ff)',
  'linear-gradient(90deg,#6c5ce7,#a29bfe)',
  'linear-gradient(90deg,#00b894,#55efc4)',
  'linear-gradient(90deg,#fdcb6e,#ffeaa7)',
  'linear-gradient(90deg,#e17055,#fab1a0)',
  '#b2bec3',
  '#b2bec3',
  '#b2bec3',
  '#b2bec3',
  '#b2bec3',
]

function fmt(v: number): string {
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + 'B'
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K'
  return v.toLocaleString()
}

export default function ModelRankBar({ models, title = '模型调用 Top 10' }: Props) {
  const maxTokens = models?.length ? Math.max(...models.map((m) => m.totalTokens)) : 1

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">🔥 {title}</h3>
          <span className="text-xs text-blue-500 cursor-pointer hover:text-blue-600">查看全部 →</span>
        </div>
      </div>
      <div className="p-5 space-y-2.5">
        {models.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-400">暂无数据</div>
        ) : (
          models.map((m, i) => {
            const pct = (m.totalTokens / maxTokens) * 100
            return (
              <div key={m.modelName} className="flex items-center gap-2.5">
                <span className="w-[120px] text-xs text-slate-700 truncate shrink-0" title={m.modelName}>
                  {m.modelName}
                </span>
                <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden">
                  <div
                    className="h-full rounded transition-all duration-300"
                    style={{
                      width: `${Math.max(pct, 2)}%`,
                      background: modelColors[i] || modelColors[5],
                    }}
                  />
                </div>
                <span className="w-14 text-right text-xs font-semibold text-slate-600 shrink-0">
                  {fmt(m.totalTokens)}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
