// ── AdminApiKeys — 管理 API Key 入口 ──
// 编排子组件：统计卡片、Key 列表、创建表单、使用日志弹窗、删除确认
// 支持批量选择和批量操作

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { get, del, patch, post } from '@/lib/api'
import FilterBar from '@/components/ui/FilterBar'
import FeatureDescription from '@/components/admin/FeatureDescription'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { useKeyBatchOperation } from '@/hooks/useKeyBatchOperation'
import type { MiniChartDataPoint } from '@/components/ui/MiniChart'
import { Key, Plus, Power, PowerOff, Clock, User, Download, X, AlertCircle, CheckCircle } from 'lucide-react'

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

  // ── 批量选择 ──
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  // ── 批量操作弹窗 ──
  const [batchDialog, setBatchDialog] = useState<{
    type: 'disable' | 'enable' | 'rate-limit' | 'assign-user' | 'export' | null
    open: boolean
  }>({ type: null, open: false })

  // ── 批量操作参数 ──
  const [batchParams, setBatchParams] = useState({
    reason: '',
    requestsPerMinute: 60,
    tokensPerDay: 100000,
    userId: 0,
    exportFormat: 'json' as 'json' | 'csv',
  })

  // ── 批量操作结果 ──
  const [batchResult, setBatchResult] = useState<{
    success: number
    failed: number
    errors?: Array<{ keyId: number; reason: string }>
  } | null>(null)

  // ── 统计数据 ──
  const stats = useMemo(() => {
    const activeCount = keys.filter((k) => k.status === 'active').length
    const disabledCount = total - activeCount
    // todayCalls 需要单独 API 支撑，默认 0
    return { total, activeCount, disabledCount, todayCalls: 0 }
  }, [keys, total])

  // ── 批量操作 Hook ──
  const batchOps = useKeyBatchOperation({
    onSuccess: (result, action) => {
      setBatchResult(result)
      if (result.success > 0) {
        setSelectedIds([])
        fetchKeys()
      }
    },
    onError: (err) => {
      alert(err.message)
    },
  })

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

  // ── 执行批量操作 ──
  const handleBatchAction = useCallback(async () => {
    if (selectedIds.length === 0) return

    try {
      switch (batchDialog.type) {
        case 'disable':
          await batchOps.batchDisable(selectedIds, batchParams.reason)
          break
        case 'enable':
          await batchOps.batchEnable(selectedIds)
          break
        case 'rate-limit':
          await batchOps.batchSetRateLimit(selectedIds, {
            requestsPerMinute: batchParams.requestsPerMinute,
            tokensPerDay: batchParams.tokensPerDay,
          })
          break
        case 'assign-user':
          await batchOps.batchAssignUser(selectedIds, batchParams.userId)
          break
        case 'export':
          await batchOps.batchExport(selectedIds, batchParams.exportFormat)
          break
      }
    } catch (err) {
      // 错误已在 hook 中处理
    }
  }, [selectedIds, batchDialog.type, batchParams, batchOps])

  // ── 打开批量操作弹窗 ──
  const openBatchDialog = useCallback((type: typeof batchDialog.type) => {
    setBatchDialog({ type, open: true })
    setBatchResult(null)
  }, [])

  // ── 关闭批量操作弹窗 ──
  const closeBatchDialog = useCallback(() => {
    setBatchDialog({ type: null, open: false })
    setBatchResult(null)
    setBatchParams({
      reason: '',
      requestsPerMinute: 60,
      tokensPerDay: 100000,
      userId: 0,
      exportFormat: 'json',
    })
  }, [])

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

      {/* ── 批量操作工具栏 ── */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-lg">
          <span className="text-sm font-medium text-indigo-900">
            已选择 {selectedIds.length} 个 Key
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => openBatchDialog('enable')}
              disabled={batchOps.loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
            >
              <Power size={14} />
              批量启用
            </button>
            <button
              onClick={() => openBatchDialog('disable')}
              disabled={batchOps.loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition disabled:opacity-50"
            >
              <PowerOff size={14} />
              批量禁用
            </button>
            <button
              onClick={() => openBatchDialog('rate-limit')}
              disabled={batchOps.loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition disabled:opacity-50"
            >
              <Clock size={14} />
              设置限速
            </button>
            <button
              onClick={() => openBatchDialog('assign-user')}
              disabled={batchOps.loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              <User size={14} />
              绑定用户
            </button>
            <button
              onClick={() => openBatchDialog('export')}
              disabled={batchOps.loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
            >
              <Download size={14} />
              导出
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 transition"
            >
              <X size={14} />
              取消选择
            </button>
          </div>
        </div>
      )}

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
        selectedIds={selectedIds}
        onSelectChange={setSelectedIds}
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

      {/* ── 批量操作确认弹窗 ── */}
      {batchDialog.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={closeBatchDialog}
        >
          <div
            className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {batchDialog.type === 'disable' && '批量禁用'}
                {batchDialog.type === 'enable' && '批量启用'}
                {batchDialog.type === 'rate-limit' && '批量设置速率限制'}
                {batchDialog.type === 'assign-user' && '批量绑定用户'}
                {batchDialog.type === 'export' && '批量导出'}
              </h2>
              <button
                onClick={closeBatchDialog}
                className="text-slate-400 hover:text-slate-600 text-xl"
              >
                &times;
              </button>
            </div>

            {/* ── 操作结果 ── */}
            {batchResult ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  {batchResult.success > 0 ? (
                    <CheckCircle size={16} className="text-green-600" />
                  ) : (
                    <AlertCircle size={16} className="text-red-600" />
                  )}
                  <span className="text-slate-700">
                    成功 {batchResult.success} 个，失败 {batchResult.failed} 个
                  </span>
                </div>
                {batchResult.errors && batchResult.errors.length > 0 && (
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {batchResult.errors.map((e, i) => (
                      <div key={i} className="text-xs text-red-600">
                        Key #{e.keyId}: {e.reason}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-end">
                  <button
                    onClick={closeBatchDialog}
                    className="px-4 py-2 text-sm bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition"
                  >
                    关闭
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* ── 操作参数 ── */}
                <p className="text-sm text-slate-600">
                  将对 <span className="font-semibold text-slate-900">{selectedIds.length}</span> 个 Key 执行操作。
                </p>

                {batchDialog.type === 'disable' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      禁用原因（可选）
                    </label>
                    <input
                      type="text"
                      value={batchParams.reason}
                      onChange={(e) => setBatchParams(p => ({ ...p, reason: e.target.value }))}
                      placeholder="请输入禁用原因"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                )}

                {batchDialog.type === 'rate-limit' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        每分钟请求数 (RPM)
                      </label>
                      <input
                        type="number"
                        value={batchParams.requestsPerMinute}
                        onChange={(e) => setBatchParams(p => ({ ...p, requestsPerMinute: Number(e.target.value) }))}
                        min={1}
                        max={10000}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        每日 Token 数 (TPD)
                      </label>
                      <input
                        type="number"
                        value={batchParams.tokensPerDay}
                        onChange={(e) => setBatchParams(p => ({ ...p, tokensPerDay: Number(e.target.value) }))}
                        min={1}
                        max={10000000}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}

                {batchDialog.type === 'assign-user' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      目标用户 ID
                    </label>
                    <input
                      type="number"
                      value={batchParams.userId || ''}
                      onChange={(e) => setBatchParams(p => ({ ...p, userId: Number(e.target.value) }))}
                      placeholder="请输入用户 ID"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                )}

                {batchDialog.type === 'export' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      导出格式
                    </label>
                    <select
                      value={batchParams.exportFormat}
                      onChange={(e) => setBatchParams(p => ({ ...p, exportFormat: e.target.value as 'json' | 'csv' }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="json">JSON</option>
                      <option value="csv">CSV</option>
                    </select>
                  </div>
                )}

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    onClick={closeBatchDialog}
                    className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleBatchAction}
                    disabled={batchOps.loading}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
                  >
                    {batchOps.loading && (
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    )}
                    确认执行
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
