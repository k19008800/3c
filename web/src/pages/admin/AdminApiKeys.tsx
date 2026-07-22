// ── AdminApiKeys — 管理 API Key 入口 ──
// 编排子组件：统计卡片、Key 列表、创建表单、使用日志弹窗、删除确认

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { get, del, patch } from '@/lib/api'
import FilterBar from '@/components/ui/FilterBar'
import FeatureDescription from '@/components/admin/FeatureDescription'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import type { MiniChartDataPoint } from '@/components/ui/MiniChart'
import { Key, Plus } from 'lucide-react'

import KeyStatsCards from './api-keys/KeyStatsCards'
import KeyList from './api-keys/KeyList'
import KeyCreateForm from './api-keys/KeyCreateForm'
import KeyUsageLogs from './api-keys/KeyUsageLogs'

interface AdminApiKeyItem {
  id: number
  name: string
  keyPrefix: string
  permissions: string[]
  status: string
  expiresAt: string | null
  lastUsedAt: string | null
  createdBy: number
  createdAt: string
}

export default function AdminApiKeys() {
  const [keys, setKeys] = useState<AdminApiKeyItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ── 持久化筛选 ──
  const { filters, setFilter, setFilters, resetFilters, hasActiveFilters } = usePersistedFilters({
    storageKey: 'admin-api-keys',
    defaults: { keyword: '', page: 1, pageSize: 20 },
  })
  const { keyword, page, pageSize } = filters as {
    keyword: string
    page: number
    pageSize: number
  }
  const totalPages = Math.ceil(total / pageSize)

  // ── 创建表单 ──
  const [formOpen, setFormOpen] = useState(false)

  // ── 日志 (KeyUsageLogs 内部管理自己的数据) ──
  const [logKeyId, setLogKeyId] = useState<number | null>(null)

  // ── 删除确认 ──
  const [deleteConfirm, setDeleteConfirm] = useState<AdminApiKeyItem | null>(null)

  // ── 趋势数据 ──
  const [trends, setTrends] = useState<Record<number, MiniChartDataPoint[]>>({})
  const [trendsLoading, setTrendsLoading] = useState(false)

  // ── 统计数据 ──
  const stats = useMemo(() => {
    const activeCount = keys.filter((k) => k.status === 'active').length
    const disabledCount = total - activeCount
    // todayCalls 需要单独 API 支撑，默认 0
    return { total, activeCount, disabledCount, todayCalls: 0 }
  }, [keys, total])

  // ── 获取 Key 列表 ──
  const fetchKeys = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, any> = { page, pageSize }
      if (keyword) params.keyword = keyword
      const data = await get<{ list: AdminApiKeyItem[]; total: number }>(
        '/api/v1/admin/api-keys',
        params,
      )
      setKeys(data.list || [])
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取管理 Key 列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, keyword])

  useEffect(() => {
    fetchKeys()
  }, [fetchKeys])

  // ── 获取趋势数据 ──
  useEffect(() => {
    if (keys.length === 0) return
    setTrendsLoading(true)
    const keyIds = keys.map((k) => k.id)

    // 尝试从批量趋势 API 获取数据，失败则静默
    ;(async () => {
      try {
        // 先尝试批量 API（如果后端有实现）
        // GET /api/v1/admin/api-keys/usage-trends?keyIds=1,2,3&days=7
        try {
          const data = await get<Record<string, { date: string; calls: number }[]>>(
            '/api/v1/admin/api-keys/usage-trends',
            { keyIds: keyIds.join(','), days: 7 },
          )
          const mapped: Record<number, MiniChartDataPoint[]> = {}
          for (const [keyId, series] of Object.entries(data)) {
            mapped[Number(keyId)] = series.map((s) => ({
              value: s.calls,
              label: s.date.slice(5),
            }))
          }
          setTrends(mapped)
          setTrendsLoading(false)
          return
        } catch {
          // 降级：逐个从日志 API 获取
        }

        // 降级方案：为每个 Key 获取最近日志并聚合趋势
        const batchResults = await Promise.allSettled(
          keyIds.map(async (kid) => {
            const logData = await get<{ list: { createdAt: string }[] }>(
              `/api/v1/admin/api-keys/${kid}/logs`,
              { page: 1, pageSize: 50 },
            )
            return { keyId: kid, logs: logData.list || [] }
          }),
        )

        const mapped: Record<number, MiniChartDataPoint[]> = {}
        for (const result of batchResults) {
          if (result.status !== 'fulfilled') continue
          const { keyId, logs } = result.value
          if (logs.length === 0) continue
          const dayCount = new Map<string, number>()
          for (const log of logs) {
            const day = log.createdAt.slice(0, 10)
            dayCount.set(day, (dayCount.get(day) || 0) + 1)
          }
          const sorted = [...dayCount.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-7)
            .map(([date, count]) => ({
              value: count,
              label: date.slice(5),
            }))
          mapped[keyId] = sorted
        }
        setTrends(mapped)
      } catch {
        // 完全静默失败
      } finally {
        setTrendsLoading(false)
      }
    })()
  }, [keys])

  // ── 切换状态 ──
  const handleToggleStatus = useCallback(
    async (key: AdminApiKeyItem) => {
      try {
        if (key.status === 'active') {
          await del(`/api/v1/admin/api-keys/${key.id}`)
        } else {
          await patch(`/api/v1/admin/api-keys/${key.id}`, { status: 'active' })
        }
        fetchKeys()
      } catch (err: any) {
        alert(err.message || '操作失败')
      }
    },
    [fetchKeys],
  )

  // ── 删除 ──
  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) return
    try {
      await del(`/api/v1/admin/api-keys/${deleteConfirm.id}`)
      setDeleteConfirm(null)
      fetchKeys()
    } catch (err: any) {
      alert(err.message || '删除失败')
    }
  }, [deleteConfirm, fetchKeys])

  return (
    <div className="space-y-6">
      {/* ── 页头 ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Key size={28} className="text-amber-600" />
          <h1 className="text-2xl font-bold text-slate-900">管理 API Key</h1>
          <FeatureDescription page="admin/admin-api-keys" className="ml-2" />
        </div>
        <button
          onClick={() => setFormOpen(!formOpen)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition text-sm"
        >
          <Plus size={16} />
          创建 Key
        </button>
      </div>

      {/* ── 统计卡片 ── */}
      <KeyStatsCards
        total={stats.total}
        activeCount={stats.activeCount}
        disabledCount={stats.disabledCount}
        todayCalls={stats.todayCalls}
        loading={loading}
      />

      {/* ── 创建表单 ── */}
      <KeyCreateForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={fetchKeys}
      />

      {/* ── 筛选栏 ── */}
      <FilterBar
        filters={{ keyword }}
        setFilter={(key, value) => setFilter(key as any, value)}
        resetFilters={resetFilters}
        hasActiveFilters={hasActiveFilters}
        onSearch={() => { setFilter('page' as any, 1); fetchKeys() }}
        fields={[
          { key: 'keyword', label: '搜索', type: 'text', placeholder: '搜索 Key 名称' },
        ]}
      />

      {/* ── Key 列表 ── */}
      <KeyList
        keys={keys}
        total={total}
        loading={loading}
        error={error}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        onPageChange={(p) => {
          setFilter('page', p)
          setTrends({})
        }}
        onPageSizeChange={(s) => {
          setFilters({ pageSize: s, page: 1 })
          setTrends({})
        }}
        onRefresh={fetchKeys}
        onToggleStatus={handleToggleStatus}
        onViewLogs={(keyId) => setLogKeyId(keyId)}
        onDelete={(key) => setDeleteConfirm(key)}
        trends={trends}
        trendsLoading={trendsLoading}
      />

      {/* ── 使用日志弹窗 ── */}
      <KeyUsageLogs keyId={logKeyId} onClose={() => setLogKeyId(null)} />

      {/* ── 删除确认弹窗 ── */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">确认删除</h2>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="text-slate-400 hover:text-slate-600 text-xl"
              >
                &times;
              </button>
            </div>
            <p className="text-sm text-slate-600">
              确定要删除 API Key{' '}
              <span className="font-semibold text-slate-900">{deleteConfirm.name}</span>{' '}
              吗?此操作不可撤销。
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
