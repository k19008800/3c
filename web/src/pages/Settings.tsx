import { useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import {
  User, Shield, Monitor, Clock, Bell, Palette,
} from 'lucide-react'
import ProfileSettings from './ProfileSettings'
import SecuritySettings from './SecuritySettings'
import SessionSettings from './SessionSettings'
import LoginHistorySettings from './LoginHistorySettings'
import PreferenceSettings from './PreferenceSettings'
import ThemeSettings from './ThemeSettings'

type Tab = 'profile' | 'security' | 'sessions' | 'login-history' | 'notifications' | 'theme'

// ── 个人设置（用户端）─-
//
// 【业务说明】
//   用户个人信息管理，包含五个标签页：
//   1. 个人资料：昵称编辑，邮箱验证（发送验证码→输入验证→状态更新）
//   2. 安全：修改密码（旧密码验证→新密码确认→加密保存）
//   3. 会话管理：活跃会话管理，可下线其他设备
//   4. 登录历史：查看最近登录记录
//   5. 通知偏好：充值成功通知、余额不足提醒（可设阈值）、每日用量汇总的开关
//
// 【权限要求】登录即可访问
// 【数据来源】GET /api/v1/auth/me, PATCH /api/v1/auth/me
// 【密码规则】旧密码必须匹配，新密码 min 6 字符

export default function Settings() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('profile')

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: 'profile', label: '个人资料', icon: User },
    { key: 'theme', label: '主题设置', icon: Palette },
    { key: 'security', label: '安全', icon: Shield },
    { key: 'sessions', label: '会话管理', icon: Monitor },
    { key: 'login-history', label: '登录历史', icon: Clock },
    { key: 'notifications', label: '通知偏好', icon: Bell },
  ]

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <User size={28} className="text-blue-600" />
        <h1 className="text-2xl font-bold text-slate-900">个人设置</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md whitespace-nowrap transition ${
                tab === t.key
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon size={16} />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'profile' && <ProfileSettings user={user} />}
      {tab === 'theme' && <ThemeSettings />}
      {tab === 'security' && <SecuritySettings />}
      {tab === 'sessions' && <SessionSettings />}
      {tab === 'login-history' && <LoginHistorySettings />}
      {tab === 'notifications' && <PreferenceSettings />}
    </div>
  )
}