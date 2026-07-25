// ============================================================
//  CampaignSchedule.tsx — 活动排期组件（开始/结束时间设置 + 剩余时间 + 手动结束）
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { Calendar, Clock, AlertCircle, CheckCircle2, XCircle, Loader2, Timer, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import api, { patch } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Campaign } from './types'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

// ── 类型 ──

interface ScheduleFormData {
  start_at: string
  end_at: string
  auto_end: boolean
}

interface CampaignScheduleProps {
  /** 正在编辑的活动（null = 新建） */
  campaign: Campaign | null
  /** 表单初始值 */
  initial?: ScheduleFormData
  /** 表单值变更回调 */
  onChange?: (data: ScheduleFormData) => void
  /** 列表模式下显示的活动列表 */
  campaigns?: Campaign[]
  /** 查看详情 */
  onView?: (id: number) => void
  /** 编辑活动 */
  onEdit?: (campaign: Campaign) => void
  /** 刷新列表 */
  onRefresh?: () => void
}

// ── 工具函数 ──

/** 格式化日期时间为本地字符串（用于 datetime-local input） */
function toLocalDatetimeString(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 格式化显示日期时间 */
function formatDatetime(dateStr: string | null): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** 计算剩余时间 */
function getTimeRemaining(endAt: string | null): { text: string; urgent: boolean; expired: boolean } {
  if (!endAt) return { text: '-', urgent: false, expired: false }

  const end = new Date(endAt)
  const now = new Date()
  const diffMs = end.getTime() - now.getTime()

  if (diffMs <= 0) return { text: '已到期', urgent: true, expired: true }

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
  const diffSeconds = Math.floor((diffMs % (1000 * 60)) / 1000)

  if (diffDays > 0) {
    return { text: `剩余 ${diffDays} 天 ${diffHours} 小时`, urgent: diffDays <= 1, expired: false }
  } else if (diffHours > 0) {
    return { text: `剩余 ${diffHours} 小时 ${diffMinutes} 分钟`, urgent: true, expired: false }
  } else if (diffMinutes > 0) {
    return { text: `剩余 ${diffMinutes} 分钟 ${diffSeconds} 秒`, urgent: true, expired: false }
  } else {
    return { text: `剩余 ${diffSeconds} 秒`, urgent: true, expired: false }
  }
}

/** 获取结束方式标签 */
function getEndMethodLabel(campaign: Campaign): { text: string; variant: 'default' | 'secondary' | 'outline' } {
  if (campaign.status === 'ended') {
    return { text: '已结束', variant: 'secondary' }
  }
  if (campaign.auto_end && campaign.end_at) {
    return { text: '自动结束', variant: 'default' }
  }
  if (campaign.end_at) {
    return { text: '手动结束', variant: 'outline' }
  }
  return { text: '未设置', variant: 'outline' }
}

// ── 排期表单组件（创建/编辑活动时使用） ──

export function ScheduleForm({
  start_at,
  end_at,
  auto_end,
  onChange,
}: {
  start_at: string
  end_at: string
  auto_end: boolean
  onChange?: (data: ScheduleFormData) => void
}) {
  const updateField = (key: keyof ScheduleFormData, value: any) => {
    onChange?.({ start_at, end_at, auto_end, [key]: value })
  }

  const timeRemaining = getTimeRemaining(end_at || null)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar size={18} className="text-indigo-500" />
          活动排期
        </CardTitle>
        <CardDescription>设置活动的开始和结束时间</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <Clock size={12} />
              开始时间
            </label>
            <Input
              type="datetime-local"
              value={start_at}
              onChange={(e) => updateField('start_at', e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <Clock size={12} />
              结束时间
            </label>
            <Input
              type="datetime-local"
              value={end_at}
              onChange={(e) => updateField('end_at', e.target.value)}
              className="text-sm"
            />
          </div>
        </div>

        {end_at && (
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
              timeRemaining.expired
                ? 'bg-red-50 text-red-600'
                : timeRemaining.urgent
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-green-50 text-green-700'
            )}
          >
            <Timer size={14} />
            {timeRemaining.expired ? (
              <span className="font-medium">活动已到期</span>
            ) : (
              <span>
                距离结束：<span className="font-medium">{timeRemaining.text}</span>
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={auto_end}
              onChange={(e) => updateField('auto_end', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600" />
          </label>
          <div className="flex flex-col">
            <span className="text-sm text-slate-700 font-medium">到期自动结束</span>
            <span className="text-xs text-slate-400">
              {auto_end ? '到达结束时间后自动结束活动' : '需手动结束活动'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── 倒计时组件（实时更新） ──

export function CountdownTimer({ endAt }: { endAt: string | null }) {
  const [display, setDisplay] = useState(() => getTimeRemaining(endAt))

  useEffect(() => {
    if (!endAt) {
      setDisplay({ text: '-', urgent: false, expired: false })
      return
    }

    const update = () => setDisplay(getTimeRemaining(endAt))
    update()

    // 每秒更新一次
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [endAt])

  if (display.expired) {
    return (
      <Badge variant="secondary" className="gap-1">
        <AlertCircle size={12} />
        已结束
      </Badge>
    )
  }

  if (display.text === '-') {
    return <span className="text-slate-400 text-sm">-</span>
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-sm font-medium',
        display.urgent ? 'text-red-600' : 'text-slate-600'
      )}
    >
      <Timer size={14} className={display.urgent ? 'animate-pulse' : ''} />
      {display.text}
    </span>
  )
}

// ── 手动结束确认对话框 ──

interface EndCampaignDialogProps {
  open: boolean
  campaign: Campaign | null
  onClose: () => void
  onSuccess: () => void
}

export function EndCampaignDialog({ open, campaign, onClose, onSuccess }: EndCampaignDialogProps) {
  const [ending, setEnding] = useState(false)
  const [error, setError] = useState('')

  const handleEnd = useCallback(async () => {
    if (!campaign) return
    setEnding(true)
    setError('')
    try {
      await patch(`/api/v1/admin/campaigns/${campaign.id}`, { status: 'ended' })
      onSuccess()
    } catch (err: any) {
      setError(err.message || '结束活动失败')
    } finally {
      setEnding(false)
    }
  }, [campaign, onSuccess])

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title="确认结束活动"
      message={
        <>
          <p className="text-sm text-slate-600">
            确定要结束活动 <strong className="text-slate-900">{campaign?.name}</strong> 吗？
          </p>
          <p className="text-xs text-slate-400 mt-1">
            结束后将无法再分配新预算，已发放的兑换码仍可正常使用。
          </p>
          {error && (
            <div className="flex items-center gap-1.5 mt-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              <AlertCircle size={14} />
              {error}
            </div>
          )}
        </>
      }
      confirmText={ending ? '结束中...' : '确认结束'}
      confirmDisabled={ending}
      onConfirm={handleEnd}
      variant="destructive"
    />
  )
}

// ── 活动排期摘要卡片（列表中使用） ──

export function ScheduleSummaryCard({ campaign }: { campaign: Campaign }) {
  const endMethod = getEndMethodLabel(campaign)

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium text-slate-900 truncate">{campaign.name}</h4>
              <Badge
                variant={
                  campaign.status === 'active'
                    ? 'default'
                    : campaign.status === 'ended'
                      ? 'secondary'
                      : 'outline'
                }
                className="shrink-0 text-xs"
              >
                {campaign.status === 'active' ? '进行中' 
                : campaign.status === 'ended' ? '已结束' 
                : campaign.status === 'draft' ? '草稿' 
                : '已归档'}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Calendar size={11} />
                {campaign.start_at ? formatDatetime(campaign.start_at) : '未设置'}
              </span>
              <span className="text-slate-300">→</span>
              <span className="flex items-center gap-1">
                <Calendar size={11} />
                {campaign.end_at ? formatDatetime(campaign.end_at) : '未设置'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2">
            {campaign.status === 'active' ? (
              <CountdownTimer endAt={campaign.end_at} />
            ) : campaign.status === 'ended' ? (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 size={12} />
                已结束
              </Badge>
            ) : (
              <span className="text-slate-400 text-sm">-</span>
            )}
          </div>
          <Badge variant={endMethod.variant} className="text-xs">
            {endMethod.text}
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}

// ── 列表模式：活动排期汇总表 ──

export function CampaignScheduleList({
  campaigns,
  onView,
  onEdit,
  onEndClick,
  loading,
}: {
  campaigns: Campaign[]
  onView?: (id: number) => void
  onEdit?: (campaign: Campaign) => void
  onEndClick?: (campaign: Campaign) => void
  loading?: boolean
}) {
  if (loading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="animate-spin inline-block" size={24} />
      </div>
    )
  }

  if (!campaigns || campaigns.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Calendar size={40} className="mx-auto mb-2 opacity-30" />
        <p className="text-sm">暂无活动</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {campaigns.map((campaign) => {
        const timeRemaining = getTimeRemaining(campaign.end_at)

        return (
          <Card
            key={campaign.id}
            className="hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => onView?.(campaign.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                {/* 左侧信息 */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-slate-900 truncate">
                      {campaign.name}
                    </h4>
                    <Badge
                      variant={
                        campaign.status === 'active'
                          ? 'default'
                          : campaign.status === 'ended'
                            ? 'secondary'
                            : 'outline'
                      }
                      className="shrink-0 text-xs"
                    >
                      {campaign.status === 'active'
                        ? '进行中'
                        : campaign.status === 'ended'
                          ? '已结束'
                          : campaign.status === 'draft'
                            ? '草稿'
                            : '已归档'}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Calendar size={11} />
                      {campaign.start_at ? formatDatetime(campaign.start_at) : '未设置开始'}
                    </span>
                    <span className="text-slate-300">→</span>
                    <span className="flex items-center gap-1">
                      <Calendar size={11} />
                      {campaign.end_at ? formatDatetime(campaign.end_at) : '未设置结束'}
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="font-mono">
                      ¥{(Number(campaign.budget_amount) || 0).toLocaleString()}
                    </span>
                  </div>

                  {/* 剩余时间 / 已结束状态 */}
                  {campaign.end_at && (
                    <div className="flex items-center gap-2">
                      {campaign.status === 'ended' ? (
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <CheckCircle2 size={12} />
                          已结束
                        </Badge>
                      ) : campaign.status === 'active' ? (
                        <CountdownTimer endAt={campaign.end_at} />
                      ) : null}
                    </div>
                  )}
                </div>

                {/* 右侧操作 */}
                <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {onEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(campaign)}
                    >
                      编辑
                    </Button>
                  )}
                  {campaign.status === 'active' && onEndClick && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => onEndClick(campaign)}
                      className="gap-1"
                    >
                      <XCircle size={14} />
                      结束
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ── 默认导出：完整组件 ──

export default function CampaignSchedule({ campaign, initial, onChange, campaigns, onView, onEdit, onRefresh }: CampaignScheduleProps) {
  const [scheduleData, setScheduleData] = useState<ScheduleFormData>(
    initial || {
      start_at: campaign?.start_at ? toLocalDatetimeString(campaign.start_at) : '',
      end_at: campaign?.end_at ? toLocalDatetimeString(campaign.end_at) : '',
      auto_end: campaign?.auto_end ?? true,
    }
  )

  const [endTarget, setEndTarget] = useState<Campaign | null>(null)
  const [endDialogOpen, setEndDialogOpen] = useState(false)

  const handleScheduleChange = useCallback(
    (data: ScheduleFormData) => {
      setScheduleData(data)
      onChange?.(data)
    },
    [onChange]
  )

  const handleEndClick = useCallback((c: Campaign) => {
    setEndTarget(c)
    setEndDialogOpen(true)
  }, [])

  const handleEndSuccess = useCallback(() => {
    setEndDialogOpen(false)
    setEndTarget(null)
    onRefresh?.()
  }, [onRefresh])

  // 如果提供了 campaigns，显示列表模式
  if (campaigns) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Zap size={18} className="text-indigo-500" />
            活动排期
          </h3>
          {campaigns.length > 0 && (
            <span className="text-xs text-slate-400">
              共 {campaigns.filter((c) => c.status === 'active').length} 个进行中 / {campaigns.length} 个活动
            </span>
          )}
        </div>
        <CampaignScheduleList
          campaigns={campaigns}
          onView={onView}
          onEdit={onEdit}
          onEndClick={handleEndClick}
        />
        <EndCampaignDialog
          open={endDialogOpen}
          campaign={endTarget}
          onClose={() => {
            setEndDialogOpen(false)
            setEndTarget(null)
          }}
          onSuccess={handleEndSuccess}
        />
      </div>
    )
  }

  // 编辑模式：显示排期表单
  return (
    <ScheduleForm
      start_at={scheduleData.start_at}
      end_at={scheduleData.end_at}
      auto_end={scheduleData.auto_end}
      onChange={handleScheduleChange}
    />
  )
}