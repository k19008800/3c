import { useState, useCallback, useMemo } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { get } from '@/lib/api'
import PaginationBar from '@/components/ui/PaginationBar'
import type { HitItem, HitsRange } from './types'

const PAGE_SIZE = 50

// ── Props ──

interface LimitLogsProps {
  onError: (err: string) => void
}

// ── 统计卡片 ──

function StatsCards({ totalToday, rangeTotal }: { totalToday: number; rangeTotal: number }) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-3">
        <AlertCircle size={20} className="text-red-500" />
        <div>
          <div className="text-sm text-red-700">今日限流次数</div>
          <div className="text-2xl font-bold text-red-600">{totalToday}</div>
        </div>
      </div>
      <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-3">
        <div>
          <div className="text-sm text-slate-500">当前查询范围</div>
          <div className="text-xl font-bold text-slate-700">{rangeTotal}</div>
        </div>
      </div>
    </div>
  )
}

// ── 时间范围按钮 ──

const RANGE_OPTIONS: { value: HitsRange; label: string }[] = [
  { value: '1h', label: '近 1 小时' },
  { value: '6h', label: '近 6 小时' },
  { value: 'today', label: '今天' },
]

function RangeSelector({ value, onChange }: { value: HitsRange; onChange: (v: HitsRange) => void }) {
  return (
    <div className="flex items-center gap-1 border border-slate-300 rounded-lg overflow-hidden">
      {RANGE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-2 text-sm transition ${value === opt.value ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── 命中记录表格 ──

function HitsTable({ hits }: { hits: HitItem[] }) {
  if (hits.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        所选时间范围内无限流命中事件
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-slate-50 text-left">
            <th className="px-4 py-3 text-sm font-medium text-slate-500">时间</th>
            <th className="px-4 py-3 text-sm font-medium text-slate-500">用户</th>
            <th className="px-4 py-3 text-sm font-medium text-slate-500">模型</th>
            <th className="px-4 py-3 text-sm font-medium text-slate-500">错误信息</th>
            <th className="px-4 py-3 text-sm font-medium text-slate-500">请求 Token</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {hits.map((h) => (
            <tr key={h.id} className="hover:bg-slate-50 transition">
              <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                {h.createdAt ? new Date(h.createdAt).toLocaleString('zh-CN') : '-'}
              </td>
              <td className="px-4 py-3">
                <div className="text-sm text-slate-800">{h.userNickname || '未知'}</div>
                <div className="text-xs text-slate-400">{h.userEmail || `ID: ${h.userId}`}</div>
              </td>
              <td className="px-4 py-3 text-sm font-mono text-slate-600">{h.modelName || '-'}</td>
              <td className="px-4 py-3 text-sm text-red-600 max-w-xs truncate" title={h.errorMessage ?? ''}>
                {h.errorMessage || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-500">
                {h.requestTokens ? parseInt(h.requestTokens).toLocaleString() : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Loading 状态 ──

function LoadingState() {
  return (
    <div className="flex justify-center py-10">
      <Loader2 className="animate-spin" size={24} />
    </div>
  )
}

// ── 主组件 ──

export default function LimitLogs({ onError }: LimitLogsProps) {
  const [hits, setHits] = useState<HitItem[]>([])
  const [hitsTotal, setHitsTotal] = useState(0)
  const [hitsTotalToday, setHitsTotalToday] = useState(0)
  const [range, setRange] = useState<HitsRange>('1h')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  const fetchHits = useCallback(async (p: number = 1) => {
    setLoading(true)
    try {
      const res = await get<{ items: HitItem[]; total: number; total429Today: number }>(
        '/api/v1/admin/rate-limits/hits',
        { limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE, range }
      )
      setHits(res.items)
      setHitsTotal(res.total)
      setHitsTotalToday(res.total429Today)
    } catch (err: any) {
      onError(err.message || '获取限流命中记录失败')
    } finally {
      setLoading(false)
    }
  }, [range, onError])

  const handleRangeChange = useCallback((r: HitsRange) => {
    setRange(r)
    setPage(1)
  }, [])

  const handlePageChange = useCallback((p: number) => {
    setPage(p)
    fetchHits(p)
  }, [fetchHits])

  const handleRefresh = useCallback(() => {
    fetchHits(page)
  }, [fetchHits, page])

  const totalPages = useMemo(() => Math.ceil(hitsTotal / PAGE_SIZE), [hitsTotal])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <StatsCards totalToday={hitsTotalToday} rangeTotal={hitsTotal} />
        <RangeSelector value={range} onChange={handleRangeChange} />
        <button onClick={handleRefresh} className="px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition">
          刷新
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <LoadingState />
        ) : (
          <>
            <HitsTable hits={hits} />
            {hitsTotal > 0 && (
              <PaginationBar
                page={page}
                onPageChange={handlePageChange}
                pageSize={PAGE_SIZE}
                total={hitsTotal}
                totalPages={totalPages}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
