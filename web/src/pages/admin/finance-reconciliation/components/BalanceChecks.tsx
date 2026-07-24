import { CheckCircle2, AlertTriangle } from 'lucide-react'
import type { ReconBalanceCheck } from '@/types'
import { fmt } from '../types'

interface BalanceChecksProps {
  checks: ReconBalanceCheck[]
}

export default function BalanceChecks({ checks }: BalanceChecksProps) {
  if (checks.length === 0) return null

  return (
    <div className="bg-white rounded-xl border p-4">
      <h3 className="text-lg font-semibold mb-4">余额校验</h3>
      <div className="space-y-3">
        {checks.map((c, idx) => (
          <div key={idx} className={`p-4 rounded-lg ${c.isBalanced ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="flex items-center gap-2 mb-2">
              {c.isBalanced ? (
                <CheckCircle2 className="text-green-600" size={20} />
              ) : (
                <AlertTriangle className="text-red-600" size={20} />
              )}
              <span className="font-medium">{c.isBalanced ? '账目平衡' : '账目异常'}</span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-slate-600">总收入</div>
                <div className="font-mono">{fmt(c.totalIncome)}</div>
              </div>
              <div>
                <div className="text-slate-600">总支出</div>
                <div className="font-mono">{fmt(c.totalExpense)}</div>
              </div>
              <div>
                <div className="text-slate-600">差异</div>
                <div className={`font-mono ${c.diff !== '0' ? 'text-red-600' : ''}`}>{fmt(c.diff)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}