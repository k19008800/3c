/**
 * RiskBadge — 风险等级标签
 *
 * props:
 *   level: 'normal' | 'suspicious' | 'high_risk'
 *   showLabel?: boolean  — 是否显示文字标签，默认 true
 */

import type { RiskLevel } from '../types'

interface RiskBadgeProps {
  level: RiskLevel
  showLabel?: boolean
}

const LEVEL_CONFIG: Record<RiskLevel, { label: string; className: string }> = {
  normal: {
    label: '正常',
    className: 'bg-green-100 text-green-700 border-green-300',
  },
  suspicious: {
    label: '可疑',
    className: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  },
  high_risk: {
    label: '高风险',
    className: 'bg-red-100 text-red-700 border-red-300 animate-pulse',
  },
}

export default function RiskBadge({ level, showLabel = true }: RiskBadgeProps) {
  const config = LEVEL_CONFIG[level] || LEVEL_CONFIG.normal

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${config.className}`}
    >
      {/* 圆点指示器 */}
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          level === 'normal'
            ? 'bg-green-500'
            : level === 'suspicious'
              ? 'bg-yellow-500'
              : 'bg-red-500'
        }`}
      />
      {showLabel && config.label}
    </span>
  )
}