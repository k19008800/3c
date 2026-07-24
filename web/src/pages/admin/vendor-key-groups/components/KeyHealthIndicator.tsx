import React, { memo } from 'react'
import type { HealthInfo } from '../utils'
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'

interface KeyHealthIndicatorProps {
  health: HealthInfo
  showDetails?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const KeyHealthIndicator: React.FC<KeyHealthIndicatorProps> = memo(({
  health,
  showDetails = true,
  size = 'md'
}) => {
  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  }

  const iconSize = {
    sm: 12,
    md: 14,
    lg: 16
  }[size]

  const Icon = {
    healthy: CheckCircle2,
    warn: AlertTriangle,
    danger: XCircle
  }[health.level]

  const label = health.level === 'healthy' ? '健康' : 
                health.level === 'warn' ? '警告' : '危险'

  return (
    <div className="flex items-center gap-2">
      {/* Icon with background */}
      <div className={`p-1 rounded-full ${health.bgColor}`}>
        <Icon size={iconSize} className={health.color} />
      </div>
      
      {/* Details */}
      {showDetails && (
        <div className="flex flex-col">
          <span className={`font-medium ${sizeClasses[size]} ${health.color}`}>
            {label}
          </span>
          {health.rate !== null && (
            <span className={`${sizeClasses[size]} text-slate-500`}>
              {health.rate.toFixed(1)}% 成功率
            </span>
          )}
        </div>
      )}
    </div>
  )
})

KeyHealthIndicator.displayName = 'KeyHealthIndicator'

export default KeyHealthIndicator