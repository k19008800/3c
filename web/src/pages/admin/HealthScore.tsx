import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import {
  Loader2, AlertCircle, Heart, Activity, Shield, RefreshCw,
  Clock, Database, Wifi, TrendingUp, Zap
} from 'lucide-react'

interface Dimension {
  label: string
  score: number
  detail: string
  weight: number
}

interface HealthScoreResult {
  overallScore: number
  level: 'excellent' | 'good' | 'fair' | 'poor'
  dimensions: Record<string, Dimension>
  updatedAt: string
}

interface HistoryItem {
  date: string
  score: number
}

const levelConfig: Record<string, { label: string; color: string; bg: string }> = {
  excellent: { label: '非常健康', color: 'text-green-600', bg: 'bg-green-50 border-green-400' },
  good: { label: '健康', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-400' },
  fair: { label: '亚健康', color: 'text-orange-600', bg: 'bg-orange-50 border-orange-400' },
  poor: { label: '不健康', color: 'text-red-600', bg: 'bg-red-50 border-red-400' },
}

export default function AdminHealthScore() {
  const [healthData, setHealthData] = useState<HealthScoreResult | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [health, hist] = await Promise.all([
        get<HealthScoreResult>('/api/v1/admin/health-score'),
        get<{ list: HistoryItem[] }>('/api/v1/admin/health-score/history'),
      ])
      setHealthData(health)
      setHistory(hist.list)
    } catch (err: any) {
      setError(err.message || '获取健康评分失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── 环形评分图 ──

  function ScoreRing({ score, size = 160 }: { score: number; size?: number }) {
    const strokeWidth = 12
    const radius = (size - strokeWidth) / 2
    const circumference = 2 * Math.PI * radius
    const offset = circumference - (score / 100) * circumference

    const color = score >= 90 ? '#22c55e' : score >= 75 ? '#3b82f6' : score >= 60 ? '#f97316' : '#ef4444'

    return (
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth} />
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
          />
        </svg>
        <div className="absolute text-center">
          <p className="text-3xl font-bold" style={{ color }}>{score}</p>
          <p className="text-xs text-gray-500">/100</p>
        </div>
      </div>
    )
  }

  // ── 维度评分条 ──

  function DimensionBar({ dim }: { dim: Dimension }) {
    const barColor = dim.score >= 80 ? 'bg-green-400' : dim.score >= 60 ? 'bg-orange-400' : 'bg-red-400'
    const weightPct = Math.round((dim.weight / 100) * 100)

    return (
      <div className="flex items-center gap-3 px-2 py-2 hover:bg-gray-50 rounded">
        <span className="text-sm w-28 flex-shrink-0">{dim.label}</span>
        <div className="flex-1 flex items-center gap-2">
          <div className="flex-1 bg-gray-100 rounded-full h-2.5">
            <div className={`h-2.5 rounded-full ${barColor} transition-all`} style={{ width: `${dim.score}%` }} />
          </div>
          <span className="text-sm font-mono font-bold w-10 text-right">{dim.score}</span>
        </div>
        <span className="text-xs text-gray-400 w-8 text-center">{weightPct}%</span>
        <span className="text-xs text-gray-500 w-48 text-right truncate" title={dim.detail}>{dim.detail}</span>
      </div>
    )
  }

  // ── 历史趋势 ──

  function HistoryChart() {
    if (history.length === 0) return <p className="text-center text-gray-400 py-8 text-sm">暂无历史数据</p>

    const maxScore = Math.max(...history.map(h => h.score), 100)
    const minScore = Math.min(...history.map(h => h.score), 60)
    const range = maxScore - minScore || 1

    return (
      <div className="space-y-1">
        {history.map(item => (
          <div key={item.date} className="flex items-center gap-3 px-2 py-1.5 hover:bg-gray-50 rounded">
            <span className="text-xs text-gray-500 w-16 flex-shrink-0">{item.date.slice(5)}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-5 relative">
              <div
                className={`h-5 rounded-full transition-all ${item.score >= 90 ? 'bg-green-400' : item.score >= 75 ? 'bg-blue-400' : item.score >= 60 ? 'bg-orange-400' : 'bg-red-400'}`}
                style={{ width: `${((item.score - minScore + 5) / (range + 10)) * 100}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white mix-blend-difference">
                {item.score}
              </span>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ── 维度图标 ──

  const dimIcons: Record<string, typeof Activity> = {
    apiAvailability: Activity,
    apiLatency: Clock,
    errorRate: Zap,
    databaseHealth: Database,
    redisHealth: Wifi,
    securityScore: Shield,
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin" size={32} /></div>
  }

  if (error) {
    return <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg"><AlertCircle size={16} /> {error}</div>
  }

  if (!healthData) return null

  const level = levelConfig[healthData.level] || levelConfig.good

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Heart className="text-red-500" size={28} />
            系统健康评分
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            基于多维度指标自动评估系统健康状态
          </p>
        </div>
        <button onClick={fetchData} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
          <RefreshCw size={14} /> 刷新
        </button>
      </div>

      {/* 总分卡片 */}
      <div className={`border rounded-xl p-6 ${level.bg}`}>
        <div className="flex items-center gap-8">
          <ScoreRing score={healthData.overallScore} size={140} />
          <div className="space-y-2">
            <p className={`text-xl font-bold ${level.color}`}>{level.label}</p>
            <p className="text-sm text-gray-600">
              更新于 {new Date(healthData.updatedAt).toLocaleString('zh-CN')}
            </p>
          </div>
        </div>
      </div>

      {/* 各维度评分 */}
      <div>
        <h2 className="text-lg font-semibold mb-3">各维度评分</h2>
        <div className="space-y-1">
          {Object.entries(healthData.dimensions).map(([key, dim]) => {
            const Icon = dimIcons[key] || Activity
            return (
              <div key={key} className="flex items-center gap-3 px-2 py-2 hover:bg-gray-50 rounded">
                <Icon size={16} className="text-gray-400" />
                <DimensionBar dim={dim} />
              </div>
            )
          })}
        </div>
      </div>

      {/* 历史趋势 */}
      <div>
        <h2 className="text-lg font-semibold mb-3">历史趋势</h2>
        <HistoryChart />
      </div>
    </div>
  )
}
