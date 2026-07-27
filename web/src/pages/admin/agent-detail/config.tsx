// ═══════════════════════════════════════════════════
//  Config — 标签页配置 + 佣金规则类型配置
//  包含 JSX，使用 .tsx 后缀
// ═══════════════════════════════════════════════════

import type { ReactNode } from 'react'
import {
  Percent,
  Activity,
  Users,
  Link2,
  DollarSign,
  Tag,
} from 'lucide-react'
import { Shield, TrendingUp as LevelIcon } from 'lucide-react'
import type { DetailTab } from './types'

export interface DetailTabConfig {
  key: DetailTab
  label: string
  icon: ReactNode
}

export const DETAIL_TABS: DetailTabConfig[] = [
  { key: 'rules', label: '佣金规则', icon: <Percent size={16} /> },
  { key: 'parent', label: '上级代理商', icon: <Link2 size={16} /> },
  { key: 'clients', label: '客户管理', icon: <Users size={16} /> },
  { key: 'level', label: '等级审核', icon: <Shield size={16} /> },
]

// 等级标签与颜色
export const AGENT_LEVEL_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  preparatory: { label: '预备代理', color: 'text-slate-500', bg: 'bg-slate-100' },
  primary: { label: '一级代理', color: 'text-blue-600', bg: 'bg-blue-50' },
  advanced: { label: '高级代理', color: 'text-purple-600', bg: 'bg-purple-50' },
  sub: { label: '子代理', color: 'text-green-600', bg: 'bg-green-50' },
}

export const AGENT_AUDIT_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: '待审核', color: 'text-amber-600', bg: 'bg-amber-50' },
  approved: { label: '已通过', color: 'text-green-600', bg: 'bg-green-50' },
  rejected: { label: '已拒绝', color: 'text-red-600', bg: 'bg-red-50' },
}

export const RULE_TYPE_CONFIG: Record<
  string,
  { label: string; icon: ReactNode; color: string; desc: string }
> = {
  sale: {
    label: '销售佣金',
    icon: <DollarSign size={18} />,
    color: 'border-l-blue-500',
    desc: '新客户首次购买产生的佣金',
  },
  renewal: {
    label: '续费佣金',
    icon: <Activity size={18} />,
    color: 'border-l-green-500',
    desc: '老客户续费产生的佣金',
  },
  team: {
    label: '团队佣金',
    icon: <Users size={18} />,
    color: 'border-l-purple-500',
    desc: '下级代理商团队业绩分佣',
  },
  activity: {
    label: '活动佣金',
    icon: <Tag size={18} />,
    color: 'border-l-orange-500',
    desc: '营销活动专属佣金配置',
  },
}

export const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  register_bonus: '注册奖励',
  first_recharge: '首充奖励',
  invite_bonus: '邀请奖励',
  consumption_milestone: '消费里程碑',
}
