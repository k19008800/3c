import { AlertTriangle } from 'lucide-react'
import type { LowMarginModel } from '../types'
import { fmt, fmtPct } from '../types'

interface LowMarginAlertProps {
  models: LowMarginModel[]
}

export default function LowMarginAlert({ models }: LowMarginAlertProps) {
  if (models.length === 0) return null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={20} className="text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-800">
          低利润预警 ({models.length} 个模型)
        </h3>
      </div>
      <div className="space-y-2">
        {models.slice(0, 5).map((m, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-slate-700">{m.modelName}</span>
            <div className="flex items-center gap-4">
              <span className="text-red-600">{fmt(m.lossAmount)} 亏损</span>
              <span className="text-amber-600">{fmtPct(m.marginRate)}</span>
            </div>
          </div>
        ))}
        {models.length > 5 && (
          <div className="text-xs text-amber-600">
            还有 {models.length - 5} 个模型...
          </div>
        )}
      </div>
    </div>
  )
}