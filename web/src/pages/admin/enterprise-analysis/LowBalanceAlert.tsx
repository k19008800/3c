import { AlertCircle } from 'lucide-react'
import type { EnterpriseOverview, EnterpriseUser } from './types'
import { fmt } from './types'

interface Props {
  overview: EnterpriseOverview | null
  onSelectEnterprise: (user: EnterpriseUser) => void
}

export default function LowBalanceAlert({ overview, onSelectEnterprise }: Props) {
  if (!overview || !overview.lowBalanceEnterpriseList || overview.lowBalanceEnterpriseList.length === 0) return null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-amber-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-amber-100 bg-amber-50/50 flex items-center gap-2">
        <AlertCircle size={16} className="text-amber-500" />
        <h3 className="text-sm font-semibold text-amber-800">低余额企业预警</h3>
        <span className="text-xs text-amber-600 ml-auto">{overview.lowBalanceEnterpriseCount} 家余额 &lt; ¥10</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-amber-100 text-xs text-amber-600">
              <th className="text-left px-4 py-3 font-medium">企业名称</th>
              <th className="text-left px-4 py-3 font-medium">邮箱</th>
              <th className="text-right px-4 py-3 font-medium">余额</th>
              <th className="text-right px-4 py-3 font-medium">最近活跃</th>
            </tr>
          </thead>
          <tbody>
            {overview.lowBalanceEnterpriseList.map(u => (
              <tr key={u.id} className="border-b border-amber-50 hover:bg-amber-50/50 transition cursor-pointer"
                onClick={() => onSelectEnterprise({ id: u.id, email: u.email, nickname: u.nickname, companyName: u.companyName, balance: u.balance, lastLoginAt: u.lastLoginAt, status: 'active' })}>
                <td className="px-4 py-2.5 font-medium text-slate-800">{u.companyName || u.nickname || u.email}</td>
                <td className="px-4 py-2.5 text-sm text-slate-500">{u.email}</td>
                <td className="px-4 py-2.5 text-right">
                  <span className="text-sm font-semibold text-red-500">¥{fmt(u.balance)}</span>
                </td>
                <td className="px-4 py-2.5 text-right text-xs text-slate-400">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
