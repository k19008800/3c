import { ChevronRight, DollarSign } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { CommissionRollupRow } from '@/types'
import { fmt } from '../utils'
import VirtualCommissionTable from './VirtualCommissionTable'

interface CommissionTableProps {
  rows: CommissionRollupRow[]
  onExpand: (agentId: number, date: string, label: string) => void
  /** 是否使用虚拟滚动，默认为true */
  useVirtualScroll?: boolean
  /** 虚拟滚动列表高度 */
  virtualScrollHeight?: number
}

export default function CommissionTable({ 
  rows, 
  onExpand,
  useVirtualScroll = true,
  virtualScrollHeight = 600,
}: CommissionTableProps) {
  // 如果启用了虚拟滚动，使用VirtualCommissionTable组件
  if (useVirtualScroll) {
    return (
      <VirtualCommissionTable
        rows={rows}
        onExpand={onExpand}
        height={virtualScrollHeight}
        useVirtualScroll={useVirtualScroll}
      />
    )
  }
  const getStatusBadge = (status: string) => {
    const map: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      pending: { variant: 'secondary', label: '待结算' },
      settled: { variant: 'default', label: '已结算' },
    }
    const cfg = map[status] || { variant: 'outline', label: status }
    return <Badge variant={cfg.variant}>{cfg.label}</Badge>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-4 py-3 text-left">代理商</th>
            <th className="px-4 py-3 text-left">日期</th>
            <th className="px-4 py-3 text-left">佣金类型</th>
            <th className="px-4 py-3 text-right">佣金金额</th>
            <th className="px-4 py-3 text-right">已结算</th>
            <th className="px-4 py-3 text-right">待结算</th>
            <th className="px-4 py-3 text-left">状态</th>
            <th className="px-4 py-3 text-left">明细</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, idx) => (
            <tr key={`${row.agentId}-${row.reportDate}-${idx}`} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <div className="text-slate-900">{row.agentEmail || `Agent #${row.agentId}`}</div>
              </td>
              <td className="px-4 py-3 text-slate-600">{row.reportDate}</td>
              <td className="px-4 py-3 text-slate-600">—</td>
              <td className="px-4 py-3 text-right font-medium">{fmt(Number(row.totalCommissionAmount) || 0)}</td>
              <td className="px-4 py-3 text-right text-green-600">{fmt(Number(row.settledAmount) || 0)}</td>
              <td className="px-4 py-3 text-right text-amber-600">{fmt(Number(row.pendingAmount) || 0)}</td>
              <td className="px-4 py-3">{getStatusBadge(row.pendingCount > 0 ? 'pending' : 'settled')}</td>
              <td className="px-4 py-3">
                <button
                  onClick={() => onExpand(
                    row.agentId,
                    row.reportDate,
                    row.agentEmail || `Agent #${row.agentId}`
                  )}
                  className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                >
                  <DollarSign size={14} />
                  <span>明细</span>
                  <ChevronRight size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}