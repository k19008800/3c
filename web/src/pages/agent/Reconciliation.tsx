import { useState, useCallback } from 'react'
import { BarChart3, Wallet } from 'lucide-react'
import ReconDetail from './reconciliation/ReconDetail'
import ReconList from './reconciliation/ReconList'

// ── 财务对账（代理商）─-
//
// 【业务说明】
//   代理商月度财务对账面板，包含两个标签页：
//   1. 月度对账：选择月份查看期初余额、本月扣费/冻结/解冻/退款变动、期末余额，
//      支持按日期范围导出 CSV 对账单
//   2. 资金流水：按余额类型和变动类型筛选的账务明细，支持 CSV 导出
//
// 【权限要求】角色=agent
// 【数据来源】GET /api/v1/agent/finance/settlement?period=, GET /api/v1/agent/finance/ledger

type TabKey = 'settlement' | 'ledger'

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'settlement', label: '月度对账', icon: BarChart3 },
  { key: 'ledger', label: '资金流水', icon: Wallet },
]

export default function AgentReconciliation() {
  const [activeTab, setActiveTab] = useState<TabKey>('settlement')

  const handleTabChange = useCallback((key: TabKey) => {
    setActiveTab(key)
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 size={28} className="text-indigo-600" />
        <h1 className="text-2xl font-bold text-slate-900">财务对账</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => handleTabChange(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === t.key
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'settlement' ? <ReconDetail /> : <ReconList />}
    </div>
  )
}
