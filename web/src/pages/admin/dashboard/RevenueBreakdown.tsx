import type { RevenueAnalysis } from '@/types'

interface Props {
  data: RevenueAnalysis | null
}

const channelLabels: Record<string, string> = {
  wechat_scan: '微信扫码',
  wechat_jsapi: '微信JSAPI',
  alipay_scan: '支付宝扫码',
  alipay_jsapi: '支付宝JSAPI',
  bank_transfer: '对公转账',
}

const typeLabels: Record<string, string> = {
  chat: 'Chat 模型',
  embedding: 'Embedding',
  image: '图像生成',
  audio: '音频处理',
}

const typeColors = ['#0984e3', '#6c5ce7', '#00b894', '#e17055']

export default function RevenueBreakdown({ data }: Props) {
  if (!data) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">💰 今日营收构成</h3>
        <div className="text-center py-8 text-sm text-slate-400">暂无数据</div>
      </div>
    )
  }

  const byType = data.today.byType
  const byChannel = data.today.byChannel
  const totalRevenue = byType.reduce((s: number, r: { cost: string }) => s + parseFloat(r.cost), 0)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">💰 今日营收构成</h3>
          <span className="text-xs text-blue-500 cursor-pointer">按模型</span>
        </div>
      </div>
      <div className="p-5 space-y-3">
        {byType.map((r, i) => (
          <div key={r.type} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: typeColors[i % typeColors.length] }} />
              <span className="text-slate-600">{typeLabels[r.type] || r.type}</span>
            </div>
            <span className="font-semibold">¥{parseFloat(r.cost).toFixed(2)}</span>
          </div>
        ))}

        <div className="border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>小计</span>
            <span>¥{totalRevenue.toFixed(2)}</span>
          </div>
        </div>

        {/* Payment channel */}
        {byChannel.length > 0 && (
          <div className="border-t border-slate-100 pt-3">
            <div className="text-xs text-slate-500 mb-2">渠道分布</div>
            <div className="flex flex-wrap gap-2">
              {byChannel.map((ch) => {
                const chTotal = parseFloat(ch.total)
                const pct = totalRevenue > 0 ? ((chTotal / (data.today.byType.reduce((s, r) => s + parseFloat(r.cost), 0))) * 100).toFixed(0) : 0
                return (
                  <span key={ch.channel} className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 rounded-full text-xs text-slate-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {channelLabels[ch.channel] || ch.channel} {pct}%
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Monthly summary */}
        <div className="border-t border-slate-100 pt-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-xs text-slate-400">月营收</div>
              <div className="text-sm font-bold text-slate-800">¥{parseFloat(data.month.revenue).toFixed(0)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">月成本</div>
              <div className="text-sm font-bold text-slate-800">¥{parseFloat(data.month.cost).toFixed(0)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">毛利率</div>
              <div className="text-sm font-bold text-emerald-600">{data.month.profitRate}%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
