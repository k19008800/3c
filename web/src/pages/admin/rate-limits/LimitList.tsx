import { useState, useCallback, useMemo } from 'react'
import { Edit2, Trash2, Search, Plus, Loader2 } from 'lucide-react'
import { get, del } from '@/lib/api'
import PaginationBar from '@/components/ui/PaginationBar'
import { MiniChart } from './LimitStatsCards'
import type { OverrideItem } from './types'

const PAGE_SIZE = 50

// ── Props ──

interface LimitListProps {
  onEdit: (item: OverrideItem) => void
  onAdd: () => void
  onMsg: (msg: string) => void
  onError: (err: string) => void
}

// ── 颜色辅助 ──

function waterColor(current: number, limit: number | null, fallback: number): string {
  const cap = limit ?? fallback
  if (current > cap) return 'text-red-500'
  if (current > cap * 0.7) return 'text-yellow-600'
  return 'text-slate-600'
}

// ── 时间范围选择组件 ──

function TrendRangeSelector({
  value,
  onChange,
}: {
  value: TrendRange
  onChange: (v: TrendRange) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as TrendRange)}
      className="text-xs border border-slate-200 rounded px-1.5 py-0.5 text-slate-400"
    >
      <option value="1h">近 1 小时</option>
      <option value="6h">近 6 小时</option>
      <option value="24h">近 24 小时</option>
    </select>
  )
}

// ── 覆盖规则表格 ──

function OverrideTable({
  overrides,
  onEdit,
  onDelete,
}: {
  overrides: OverrideItem[]
  onEdit: (item: OverrideItem) => void
  onDelete: (quotaId: number) => void
}) {
  if (overrides.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <div className="text-sm font-medium">暂无用户覆盖规则</div>
        <div className="text-xs mt-1">点击「添加覆盖」为特定用户设置独立的 RPM/TPM 限流</div>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-slate-50 text-left">
            <th className="px-4 py-3 text-sm font-medium text-slate-500">用户</th>
            <th className="px-4 py-3 text-sm font-medium text-slate-500">类型</th>
            <th className="px-4 py-3 text-sm font-medium text-slate-500">RPM 覆盖</th>
            <th className="px-4 py-3 text-sm font-medium text-slate-500">当前 RPM</th>
            <th className="px-4 py-3 text-sm font-medium text-slate-500">TPM 覆盖</th>
            <th className="px-4 py-3 text-sm font-medium text-slate-500">当前 TPM</th>
            <th className="px-4 py-3 text-sm font-medium text-slate-500">有效期</th>
            <th className="px-4 py-3 text-sm font-medium text-slate-500">设定人</th>
            <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {overrides.map((o) => (
            <tr key={o.quotaId} className="hover:bg-slate-50 transition">
              <td className="px-4 py-3">
                <div className="text-sm font-medium text-slate-800">{o.userNickname || '未设置'}</div>
                <div className="text-xs text-slate-400">ID: {o.userId} {o.userEmail ? `| ${o.userEmail}` : ''}</div>
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full ${o.userType === 'enterprise' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
                  {o.userType === 'enterprise' ? '企业' : '个人'}
                </span>
              </td>
              <td className="px-4 py-3 text-sm font-mono text-blue-600">{o.rpmLimit?.toLocaleString() ?? '-'}</td>
              <td className="px-4 py-3">
                <span className={`text-sm font-mono ${waterColor(o.currentRpm, o.rpmLimit, 99999)}`}>
                  {o.currentRpm}
                </span>
              </td>
              <td className="px-4 py-3 text-sm font-mono text-blue-600">{o.tpmLimit?.toLocaleString() ?? '-'}</td>
              <td className="px-4 py-3">
                <span className={`text-sm font-mono ${waterColor(o.currentTpm, o.tpmLimit, 99999999)}`}>
                  {o.currentTpm.toLocaleString()}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">
                {o.periodStart ? new Date(o.periodStart).toLocaleDateString('zh-CN') : '-'}
                ~{o.periodEnd ? new Date(o.periodEnd).toLocaleDateString('zh-CN') : '-'}
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">{o.setByRole === 'admin' ? '管理员' : '代理商'}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => onEdit(o)} className="text-blue-400 hover:text-blue-600 transition" title="编辑覆盖">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => onDelete(o.quotaId)} className="text-red-400 hover:text-red-600 transition" title="清除覆盖">
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── 趋势范围类型 ──

type TrendRange = '1h' | '6h' | '24h'

// ── 主组件 ──

export default function LimitList({ onEdit, onAdd, onMsg, onError }: LimitListProps) {
  const [overrides, setOverrides] = useState<OverrideItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [page, setPage] = useState(1)
  const [trendRange, setTrendRange] = useState<TrendRange>('1h')

  const fetchOverrides = useCallback(async (p: number = 1) => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = { limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE }
      if (searchText) {
        const numId = parseInt(searchText, 10)
        if (!isNaN(numId) && String(numId) === searchText) {
          params.user_id = searchText
        } else {
          params.search = searchText
        }
      }
      const res = await get<{ items: OverrideItem[]; total: number }>('/api/v1/admin/rate-limits/overrides', params)
      setOverrides(res.items)
      setTotal(res.total)
    } catch (err: any) {
      onError(err.message || '获取覆盖规则失败')
    } finally {
      setLoading(false)
    }
  }, [searchText, onError])

  const handleSearch = useCallback(() => {
    setPage(1)
    fetchOverrides(1)
  }, [fetchOverrides])

  const handleDelete = useCallback(async (quotaId: number) => {
    if (!confirm('确定清除该用户的限流覆盖?')) return
    try {
      await del(`/api/v1/admin/rate-limits/overrides/${quotaId}`)
      onMsg('限流覆盖已清除')
      fetchOverrides(page)
    } catch (err: any) {
      onError(err.message || '删除失败')
    }
  }, [page, fetchOverrides, onMsg, onError])

  const handlePageChange = useCallback((p: number) => {
    setPage(p)
    fetchOverrides(p)
  }, [fetchOverrides])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }, [handleSearch])

  const totalPages = useMemo(() => Math.ceil(total / PAGE_SIZE), [total])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="搜索用户 ID / 邮箱 / 昵称..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button onClick={handleSearch} className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm hover:bg-blue-100 transition">
          搜索
        </button>
        <button onClick={onAdd} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition flex items-center gap-1.5">
          <Plus size={16} />
          添加覆盖
        </button>
        <span className="text-sm text-slate-500">共{total} 条覆盖规则</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-400">调用趋势</span>
          <TrendRangeSelector value={trendRange} onChange={setTrendRange} />
          <MiniChart data={[12, 19, 15, 22, 18, 25, 20, 28, 24]} height={24} color="#3b82f6" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <OverrideTable overrides={overrides} onEdit={onEdit} onDelete={handleDelete} />
          {total > 0 && (
            <PaginationBar
              page={page}
              onPageChange={handlePageChange}
              pageSize={PAGE_SIZE}
              total={total}
              totalPages={totalPages}
            />
          )}
        </div>
      )}
    </div>
  )
}
