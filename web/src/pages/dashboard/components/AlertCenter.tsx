import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  AlertCircle,
  Info,
  XCircle,
  CheckCircle,
  X,
  ChevronDown,
  ChevronRight,
  Bell,
  TrendingUp,
  Gauge,
  Shield,
  Activity,
  RefreshCw,
} from 'lucide-react'
import { get, post } from '@/lib/api'
import type { AlertItem, AlertStats, AlertLevel, AlertType } from '@/types/alert'

interface Props {
  /** 初始展开状态 */
  defaultExpanded?: boolean
  /** 自动刷新间隔（毫秒），默认 60000 (1分钟) */
  refreshInterval?: number
  /** 最大显示告警数 */
  maxAlerts?: number
}

/**
 * AlertCenter — 异常告警中心
 * 聚合多种告警类型：失败率突增、配额耗尽、异地登录、异常调用模式
 */
export default function AlertCenter({
  defaultExpanded = true,
  refreshInterval = 60000,
  maxAlerts = 10,
}: Props) {
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [stats, setStats] = useState<AlertStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [filter, setFilter] = useState<AlertLevel | 'all'>('all')
  const [acknowledging, setAcknowledging] = useState<string | null>(null)

  // 获取告警数据
  const fetchAlerts = useCallback(async () => {
    try {
      const data = await get<{ alerts: AlertItem[]; stats: AlertStats }>('/api/v1/me/alerts')
      setAlerts(data.alerts || [])
      setStats(data.stats)
      setError('')
    } catch (err: any) {
      setError(err.message || '获取告警数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  // 确认/忽略告警
  const handleAcknowledge = async (alertId: string, action: 'acknowledge' | 'ignore') => {
    setAcknowledging(alertId)
    try {
      await post('/api/v1/me/alerts/acknowledge', { alertId, action })
      // 更新本地状态
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alertId
            ? { ...a, acknowledged: true, acknowledgedAt: new Date().toISOString() }
            : a
        )
      )
      setStats((prev) =>
        prev ? { ...prev, unacknowledged: Math.max(0, prev.unacknowledged - 1) } : null
      )
    } catch (err: any) {
      console.error('确认告警失败:', err)
    } finally {
      setAcknowledging(null)
    }
  }

  // 初始加载 + 定时刷新
  useEffect(() => {
    fetchAlerts()
    if (refreshInterval > 0) {
      const timer = setInterval(fetchAlerts, refreshInterval)
      return () => clearInterval(timer)
    }
  }, [fetchAlerts, refreshInterval])

  // 过滤告警
  const filteredAlerts = alerts
    .filter((a) => filter === 'all' || a.level === filter)
    .slice(0, maxAlerts)

  // 告警级别图标和颜色
  const getLevelConfig = (level: AlertLevel) => {
    switch (level) {
      case 'critical':
        return {
          icon: XCircle,
          color: 'text-red-600',
          bg: 'bg-red-50',
          border: 'border-red-200',
          badge: 'bg-red-100 text-red-700',
        }
      case 'error':
        return {
          icon: AlertCircle,
          color: 'text-orange-600',
          bg: 'bg-orange-50',
          border: 'border-orange-200',
          badge: 'bg-orange-100 text-orange-700',
        }
      case 'warning':
        return {
          icon: AlertTriangle,
          color: 'text-amber-600',
          bg: 'bg-amber-50',
          border: 'border-amber-200',
          badge: 'bg-amber-100 text-amber-700',
        }
      case 'info':
        return {
          icon: Info,
          color: 'text-blue-600',
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          badge: 'bg-blue-100 text-blue-700',
        }
    }
  }

  // 告警类型图标
  const getTypeIcon = (type: AlertType) => {
    switch (type) {
      case 'failure_rate_spike':
        return TrendingUp
      case 'quota_exhaustion':
        return Gauge
      case 'suspicious_login':
        return Shield
      case 'abnormal_call_pattern':
        return Activity
    }
  }

  // 告警级别标签
  const levelLabels: Record<AlertLevel, string> = {
    critical: '严重',
    error: '错误',
    warning: '警告',
    info: '提示',
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 text-slate-400">
          <RefreshCw size={18} className="animate-spin" />
          <span className="text-sm">加载告警数据...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle size={18} />
          <span className="text-sm">{error}</span>
          <button
            onClick={fetchAlerts}
            className="ml-auto text-blue-600 hover:underline text-sm"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  // 无告警
  if (alerts.length === 0) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 text-slate-500">
          <CheckCircle size={18} className="text-green-500" />
          <span className="text-sm">系统运行正常，暂无告警</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition text-left"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <Bell size={20} className="text-slate-600" />
            {stats && stats.unacknowledged > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {stats.unacknowledged > 9 ? '9+' : stats.unacknowledged}
              </span>
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">异常告警中心</h2>
            <p className="text-xs text-slate-500">
              {stats?.total || 0} 条告警
              {stats && stats.unacknowledged > 0 && ` · ${stats.unacknowledged} 条未确认`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* 统计徽章 */}
          {stats && (
            <div className="flex items-center gap-1.5">
              {stats.critical > 0 && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                  {stats.critical} 严重
                </span>
              )}
              {stats.error > 0 && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
                  {stats.error} 错误
                </span>
              )}
              {stats.warning > 0 && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                  {stats.warning} 警告
                </span>
              )}
            </div>
          )}
          {expanded ? (
            <ChevronDown size={18} className="text-slate-400" />
          ) : (
            <ChevronRight size={18} className="text-slate-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-slate-100">
          {/* 过滤器 */}
          <div className="flex items-center gap-2 pt-4">
            <span className="text-xs text-slate-500">筛选：</span>
            <div className="flex gap-1">
              {(['all', 'critical', 'error', 'warning', 'info'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                    filter === f
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f === 'all' ? '全部' : levelLabels[f]}
                </button>
              ))}
            </div>
            <button
              onClick={fetchAlerts}
              className="ml-auto flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition"
            >
              <RefreshCw size={12} />
              刷新
            </button>
          </div>

          {/* 告警列表 */}
          <div className="space-y-2">
            {filteredAlerts.map((alert) => {
              const levelConfig = getLevelConfig(alert.level)
              const TypeIcon = getTypeIcon(alert.type)
              const LevelIcon = levelConfig.icon

              return (
                <div
                  key={alert.id}
                  className={`rounded-lg border ${levelConfig.border} ${levelConfig.bg} p-3 transition ${
                    alert.acknowledged ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* 图标 */}
                    <div className={`shrink-0 ${levelConfig.color}`}>
                      <LevelIcon size={18} />
                    </div>

                    {/* 内容 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <TypeIcon size={14} className={levelConfig.color} />
                        <span className="font-medium text-sm text-slate-900">
                          {alert.title}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${levelConfig.badge}`}>
                          {levelLabels[alert.level]}
                        </span>
                        {alert.acknowledged && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200 text-slate-600">
                            已确认
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {alert.message}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] text-slate-400">
                          {new Date(alert.createdAt).toLocaleString('zh-CN')}
                        </span>
                        {alert.detailPath && (
                          <Link
                            to={alert.detailPath}
                            className="text-[10px] text-blue-600 hover:underline"
                          >
                            查看详情 →
                          </Link>
                        )}
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    {!alert.acknowledged && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleAcknowledge(alert.id, 'acknowledge')}
                          disabled={acknowledging === alert.id}
                          className={`p-1.5 rounded hover:bg-white/50 transition ${
                            acknowledging === alert.id ? 'opacity-50' : ''
                          }`}
                          title="确认"
                        >
                          <CheckCircle size={14} className="text-green-600" />
                        </button>
                        <button
                          onClick={() => handleAcknowledge(alert.id, 'ignore')}
                          disabled={acknowledging === alert.id}
                          className={`p-1.5 rounded hover:bg-white/50 transition ${
                            acknowledging === alert.id ? 'opacity-50' : ''
                          }`}
                          title="忽略"
                        >
                          <X size={14} className="text-slate-500" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 更多告警提示 */}
          {alerts.length > maxAlerts && (
            <p className="text-xs text-slate-400 text-center">
              还有 {alerts.length - maxAlerts} 条告警未显示
            </p>
          )}
        </div>
      )}
    </div>
  )
}
