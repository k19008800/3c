import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Filter, RefreshCw, ArrowDownRight, MinusCircle, PlusCircle, RotateCcw } from 'lucide-react'
import { get } from '@/lib/api'
import PaginationBar from '@/components/ui/PaginationBar'
import type { LedgerEntry } from './types'
import { CHANGE_TYPE_LABEL, BALANCE_TYPE_LABEL, CHANGE_TYPE_COLOR, fmtMicro } from './types'

// ── Change type icon map ──

const CHANGE_TYPE_ICON: Record<string, typeof ArrowDownRight> = {
  deduction: ArrowDownRight,
  freeze: MinusCircle,
  unfreeze: PlusCircle,
  refund: RotateCcw,
}

// ── Component ──

function ReconList() {
  const [list, setList] = useState<LedgerEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [balanceType, setBalanceType] = useState('')
  const [changeType, setChangeType] = useState('')

  const fetchLedger = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) })
      if (balanceType) params.set('balanceType', balanceType)
      if (changeType) params.set('changeType', changeType)
      const res = await get<any>(`/api/v1/agent/finance/ledger?${params.toString()}`)
      setList(res?.list ?? [])
      setTotal(res?.total ?? 0)
    } catch {
      // console.error omitted for production
    } finally {
      setLoading(false)
    }
  }, [pageSize, balanceType, changeType])

  useEffect(() => {
    setPage(1)
    fetchLedger(1)
  }, [balanceType, changeType])

  useEffect(() => {
    fetchLedger(page)
  }, [page])

  const totalPages = useMemo(() => Math.ceil(total / pageSize), [total, pageSize])

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-500" />
          <select
            value={balanceType}
            onChange={e => setBalanceType(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">全部余额类型</option>
            <option value="available">可用余额</option>
            <option value="frozen">冻结余额</option>
          </select>
          <select
            value={changeType}
            onChange={e => setChangeType(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">全部变更类型</option>
            <option value="deduction">扣费</option>
            <option value="freeze">冻结</option>
            <option value="unfreeze">解冻</option>
            <option value="refund">退款</option>
          </select>
        </div>
        <button
          onClick={() => fetchLedger(page)}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <RefreshCw size={24} className="animate-spin text-slate-400" />
          </div>
        ) : list.length === 0 ? (
          <div className="text-center py-12 text-slate-400">暂无资金流水记录</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-4 py-3 font-medium text-slate-600">时间</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">类型</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">余额类型</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">金额</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">变更前</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">变更后</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">备注</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(entry => {
                    const IconComp = CHANGE_TYPE_ICON[entry.changeType]
                    return (
                      <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {new Date(entry.createdAt).toLocaleString('zh-CN')}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${CHANGE_TYPE_COLOR[entry.changeType] || 'text-slate-600'}`}>
                            {IconComp && <IconComp size={12} />}
                            {CHANGE_TYPE_LABEL[entry.changeType] || entry.changeType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">
                          {BALANCE_TYPE_LABEL[entry.balanceType] || entry.balanceType}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono text-xs ${entry.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {entry.amount > 0 ? '+' : ''}{fmtMicro(entry.amount)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-slate-500">
                          {fmtMicro(entry.balanceBefore)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-slate-700">
                          {fmtMicro(entry.balanceAfter)}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs max-w-[200px] truncate" title={entry.remark || ''}>
                          {entry.remark || '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-slate-200">
                <PaginationBar page={page} onPageChange={setPage} pageSize={pageSize} onPageSizeChange={() => {}} total={total} totalPages={totalPages} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default memo(ReconList)
