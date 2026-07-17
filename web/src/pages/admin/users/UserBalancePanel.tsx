// ──────────────────────────────────────────────
//  UserBalancePanel — 余额管理子面板
//  包含：手动充值表单 + 余额流水记录
// ──────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import type { PaginatedData, BalanceLogRecord } from '@/types'
import { Loader2 } from 'lucide-react'
import { fmtDate, balanceTypeLabel } from './_shared'

// ── Recharge Form ─────────────────────────────

interface RechargeFormProps {
  userId: number
  onMsg: (s: string) => void
}

export function RechargeForm({ userId, onMsg }: RechargeFormProps) {
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')

  const handleRecharge = async () => {
    const amt = parseFloat(amount)
    if (!amt) return
    try {
      await post(`/api/v1/admin/users/${userId}/recharge`, {
        amount: amt,
        description: description || undefined,
      })
      onMsg(`✅ 已充值 ¥${amt.toFixed(4)}`)
      setAmount('')
      setDescription('')
    } catch (err: any) {
      onMsg('❌ ' + (err.message || ''))
    }
  }

  return (
    <div className="border-t pt-4 space-y-3">
      <h3 className="text-sm font-medium text-slate-700">手动充值</h3>
      <div className="flex gap-2">
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="充值金额"
          className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-sm"
        />
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="备注（可选）"
          className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-sm"
        />
        <button
          onClick={handleRecharge}
          disabled={!amount}
          className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          充值
        </button>
      </div>
    </div>
  )
}

// ── Balance Logs Tab ──────────────────────────

interface BalanceLogsTabProps {
  userId: number
}

export function BalanceLogsTab({ userId }: BalanceLogsTabProps) {
  const [data, setData] = useState<BalanceLogRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('')

  useEffect(() => {
    setLoading(true)
    ;(async () => {
      try {
        const params: any = {}
        if (typeFilter) params.type = typeFilter
        setData(
          (await get<PaginatedData<BalanceLogRecord>>(`/api/v1/admin/users/${userId}/balance-logs`, params))
            .list,
        )
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    })()
  }, [userId, typeFilter])

  if (loading) {
    return (
      <div className="text-center py-8">
        <Loader2 className="animate-spin inline-block" size={24} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">类型：</span>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-2 py-1 border border-slate-300 rounded text-sm"
        >
          <option value="">全部</option>
          {Object.entries(balanceTypeLabel).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {data.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-4">暂无余额流水</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-3 py-2 text-slate-500">时间</th>
                <th className="px-3 py-2 text-slate-500">类型</th>
                <th className="px-3 py-2 text-slate-500">金额</th>
                <th className="px-3 py-2 text-slate-500">变更后余额</th>
                <th className="px-3 py-2 text-slate-500">参考</th>
                <th className="px-3 py-2 text-slate-500">描述</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                    {fmtDate(r.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                      {balanceTypeLabel[r.type] || r.type}
                    </span>
                  </td>
                  <td
                    className={`px-3 py-2 font-medium ${Number(r.amount) >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {Number(r.amount) >= 0 ? '+' : ''}
                    {Number(r.amount).toFixed(4)}
                  </td>
                  <td className="px-3 py-2">
                    ¥{Number(r.balanceAfter).toFixed(4)}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {r.refType || '-'}
                  </td>
                  <td className="px-3 py-2 max-w-[200px] truncate text-xs text-slate-500">
                    {r.description || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
