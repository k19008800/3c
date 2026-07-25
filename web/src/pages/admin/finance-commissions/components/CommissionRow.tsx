import { useState } from 'react'
import { ChevronDown, ChevronRight, DollarSign, CheckCircle, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { fmt } from '../utils'
import type { CommissionRollupRow } from '@/types'

interface CommissionRowProps {
  row: CommissionRollupRow
  isExpanded: boolean
  onExpand: () => void
  onSettle?: (commission: CommissionRollupRow) => void
}

export default function CommissionRow({ 
  row, 
  isExpanded, 
  onExpand, 
  onSettle 
}: CommissionRowProps) {
  const [showDetails, setShowDetails] = useState(false)
  
  const getStatusBadge = () => {
    const isPending = row.pendingCount > 0
    
    if (isPending) {
      return {
        variant: 'secondary' as const,
        label: '待结算',
        icon: Clock,
        color: 'text-yellow-600 bg-yellow-100',
      }
    }
    
    return {
      variant: 'default' as const,
      label: '已结算',
      icon: CheckCircle,
      color: 'text-green-600 bg-green-100',
    }
  }

  const status = getStatusBadge()
  const StatusIcon = status.icon

  return (
    <>
      {/* 主行 */}
      <tr 
        className={`hover:bg-slate-50 transition-colors ${isExpanded ? 'bg-blue-50' : ''}`}
        onClick={onExpand}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onExpand()
              }}
              className="text-slate-400 hover:text-slate-600"
            >
              {isExpanded ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
            </button>
            <div>
              <div className="font-medium text-slate-900">
                {row.agentEmail || `Agent #${row.agentId}`}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                ID: {row.agentId}
              </div>
            </div>
          </div>
        </td>
        
        <td className="px-4 py-3">
          <div className="text-slate-900">{row.reportDate}</div>
        </td>
        
        <td className="px-4 py-3">
          <div className="text-slate-600">—</div>
        </td>
        
        <td className="px-4 py-3 text-right">
          <div className="font-medium">{fmt(Number(row.totalCommissionAmount) || 0)}</div>
        </td>
        
        <td className="px-4 py-3 text-right">
          <div className="text-green-600">{fmt(Number(row.settledAmount) || 0)}</div>
        </td>
        
        <td className="px-4 py-3 text-right">
          <div className="text-yellow-600">{fmt(Number(row.pendingAmount) || 0)}</div>
        </td>
        
        <td className="px-4 py-3">
          <Badge 
            variant={status.variant} 
            className={`${status.color} flex items-center gap-1`}
          >
            <StatusIcon size={12} />
            {status.label}
          </Badge>
        </td>
        
        <td className="px-4 py-3">
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onExpand()
              }}
              className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
            >
              <DollarSign size={14} />
              明细
            </button>
            
            {row.pendingCount > 0 && onSettle && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onSettle(row)
                }}
                className="text-sm text-green-600 hover:text-green-800"
              >
                结算
              </button>
            )}
          </div>
        </td>
      </tr>
      
      {/* 展开详情 */}
      {isExpanded && (
        <tr className="bg-blue-50/50">
          <td colSpan={8} className="px-4 py-3">
            <div className="space-y-4">
              {/* 基本信息 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-slate-500">佣金总额</div>
                  <div className="font-medium">{fmt(Number(row.totalCommissionAmount) || 0)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">已结算</div>
                  <div className="font-medium text-green-600">{fmt(Number(row.settledAmount) || 0)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">待结算</div>
                  <div className="font-medium text-yellow-600">{fmt(Number(row.pendingAmount) || 0)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">待结算数量</div>
                  <div className="font-medium">{row.pendingCount}</div>
                </div>
              </div>
              
              {/* 操作按钮 */}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  {showDetails ? '隐藏详情' : '查看详情'}
                </button>
                {row.pendingCount > 0 && onSettle && (
                  <button
                    onClick={() => onSettle(row)}
                    className="text-sm bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
                  >
                    结算佣金
                  </button>
                )}
              </div>
              
              {/* 详细数据 */}
              {showDetails && (
                <div className="text-sm text-slate-600 bg-white p-3 rounded border">
                  <p>这里是详细的佣金信息...</p>
                  {/* 这里可以添加更多详细数据 */}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}