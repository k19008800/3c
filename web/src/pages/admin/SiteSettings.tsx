// ============================================================
//  SiteSettings — 站点设置入口（Tab 导航）
//  子组件位于 site-settings/ 目录下
// ============================================================

import { useState, useCallback } from 'react'
import { Settings, Mail, Shield, Cpu, DollarSign } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'
import GeneralSettings from './site-settings/GeneralSettings'
import EmailSettings from './site-settings/EmailSettings'
import SecuritySettings from './site-settings/SecuritySettings'
import ApiSettings from './site-settings/ApiSettings'
import BillingSettings from './site-settings/BillingSettings'

// ── Tab 定义 ──

interface TabItem {
  id: string
  label: string
  icon: React.ReactNode
  component: React.FC
}

const TABS: TabItem[] = [
  { id: 'general', label: '基本设置', icon: <Settings size={16} />, component: GeneralSettings },
  { id: 'email', label: '邮件配置', icon: <Mail size={16} />, component: EmailSettings },
  { id: 'security', label: '安全参数', icon: <Shield size={16} />, component: SecuritySettings },
  { id: 'api', label: 'API 参数', icon: <Cpu size={16} />, component: ApiSettings },
  { id: 'billing', label: '计费配置', icon: <DollarSign size={16} />, component: BillingSettings },
]

export default function AdminSiteSettings() {
  const [activeTab, setActiveTab] = useState('general')

  const handleTabClick = useCallback((id: string) => {
    setActiveTab(id)
  }, [])

  const ActiveComponent = TABS.find((t) => t.id === activeTab)?.component ?? GeneralSettings

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">站点设置</h1>
        <p className="text-sm text-slate-500 mt-1">
          管理系统配置、网站参数、邮件、安全策略和计费参数
        </p>
      </div>

      <FeatureDescription page="admin/site-settings" className="ml-2" />

      {/* Tab 导航 */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-1 -mb-px overflow-x-auto" role="tablist">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => handleTabClick(tab.id)}
                className={`
                  flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium
                  border-b-2 transition-colors whitespace-nowrap
                  ${isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }
                `}
              >
                {tab.icon}
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab 内容 */}
      <div role="tabpanel" className="min-h-[300px]">
        <ActiveComponent />
      </div>
    </div>
  )
}
