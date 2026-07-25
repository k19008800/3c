import { useState } from 'react'
import { ShieldAlert, Activity, Sliders, Search } from 'lucide-react'
import RiskStatsCards from './RiskStatsCards'
import StrategyPanel from './StrategyPanel'
import DetectTool from './DetectTool'
import RiskEventsList from './RiskEventsList'

type Tab = 'overview' | 'strategies' | 'detect' | 'events'

export default function AdminRiskControl() {
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const tabs: { key: Tab; label: string; icon: typeof ShieldAlert }[] = [
    { key: 'overview', label: '概览', icon: Activity },
    { key: 'strategies', label: '策略配置', icon: Sliders },
    { key: 'detect', label: '手动检测', icon: Search },
    { key: 'events', label: '风险事件', icon: ShieldAlert },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldAlert className="text-orange-500" size={28} />
          AI 风控模型
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          多维度规则引擎风控检测 &mdash; 基于操作内容、频率、IP 等维度自动评估风险等级
        </p>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-1 border-b">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      <div className="min-h-[400px]">
        {activeTab === 'overview' && <RiskStatsCards />}
        {activeTab === 'strategies' && <StrategyPanel />}
        {activeTab === 'detect' && <DetectTool />}
        {activeTab === 'events' && <RiskEventsList />}
      </div>
    </div>
  )
}
