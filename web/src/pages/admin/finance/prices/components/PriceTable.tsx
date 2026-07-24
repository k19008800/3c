import { Edit2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { VendorModelRow } from '../types'
import { fmtPrice, calcMultiplier } from '../types'

interface PriceTableProps {
  models: VendorModelRow[]
  onEdit: (model: VendorModelRow) => void
}

export default function PriceTable({ models, onEdit }: PriceTableProps) {
  const getStatusBadge = (status: boolean) => {
    return status
      ? <Badge variant="default">启用</Badge>
      : <Badge variant="secondary">禁用</Badge>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-4 py-3 text-left">模型</th>
            <th className="px-4 py-3 text-left">供应商</th>
            <th className="px-4 py-3 text-right">售价(输入)</th>
            <th className="px-4 py-3 text-right">售价(输出)</th>
            <th className="px-4 py-3 text-right">成本(输入)</th>
            <th className="px-4 py-3 text-right">成本(输出)</th>
            <th className="px-4 py-3 text-right">倍率</th>
            <th className="px-4 py-3 text-left">状态</th>
            <th className="px-4 py-3 text-left">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {models.map((m) => {
            const inputMult = calcMultiplier(m.sellPriceInput, m.costPriceInput)
            const outputMult = calcMultiplier(m.sellPriceOutput, m.costPriceOutput)
            return (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="text-slate-900">{m.modelName}</div>
                  {m.upstreamModelName && (
                    <div className="text-xs text-slate-500">{m.upstreamModelName}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{m.vendorName || '—'}</td>
                <td className="px-4 py-3 text-right font-mono">{fmtPrice(m.sellPriceInput)}</td>
                <td className="px-4 py-3 text-right font-mono">{fmtPrice(m.sellPriceOutput)}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-500">{fmtPrice(m.costPriceInput)}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-500">{fmtPrice(m.costPriceOutput)}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {inputMult !== null ? `${inputMult.toFixed(2)}x` : '—'}
                </td>
                <td className="px-4 py-3">{getStatusBadge(m.status)}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onEdit(m)}
                    className="p-1 text-slate-400 hover:text-blue-600"
                  >
                    <Edit2 size={16} />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}