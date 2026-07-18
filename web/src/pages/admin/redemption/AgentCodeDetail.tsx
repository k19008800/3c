import { useMemo } from 'react'
import { Loader2, Handshake, Trash2 } from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import { codeStatusMap } from './types'
import type { AgentCodeDetailItem } from './types'

// ── Props ──

interface AgentCodeDetailProps {
  agentName: string
  codes: AgentCodeDetailItem[]
  total: number
  page: number
  pageSize: number
  loading: boolean
  forcingId: number | null
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onBack: () => void
  onRevoke: (codeId: number) => void
  onDisable: (codeId: number) => void
  onExtend: (codeId: number) => void
}

// ── Component ──

export default function AgentCodeDetail({
  agentName,
  codes,
  total,
  page,
  pageSize,
  loading,
  forcingId,
  onPageChange,
  onPageSizeChange,
  onBack,
  onRevoke,
  onDisable,
  onExtend,
}: AgentCodeDetailProps) {
  const totalPages = useMemo(() => Math.ceil(total / pageSize), [total, pageSize])

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 space-y-4">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Handshake size={18} className="text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-800">{agentName} - 兑换码列表</h3>
        </div>
        <button
          onClick={onBack}
          className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 bg-blue-50 rounded"
        >
          返回代理总览
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : codes.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-sm">该代理暂无兑换码</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">码</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">批次</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">金额</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">已用次数</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {codes.map(c => {
                const sc = codeStatusMap[c.status] || { label: c.status, color: 'bg-slate-100 text-slate-700' }
                return (
                  <tr key={c.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm font-mono text-slate-700">{c.code}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{c.batchName || '-'}</td>
                    <td className="px-4 py-3 text-sm font-medium text-green-600">￥{Number(c.amount).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${sc.color}`}>{sc.label}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{c.usesLeft}/{c.usesLeft + 1}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {new Date(c.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onRevoke(c.id)}
                          disabled={forcingId === c.id}
                          className="flex items-center gap-0.5 text-xs text-red-600 hover:text-red-800 px-1 py-0.5 rounded"
                        >
                          {forcingId === c.id ? <Loader2 className="animate-spin" size={10} /> : <Trash2 size={10} />}
                          作废
                        </button>
                        <button
                          onClick={() => onDisable(c.id)}
                          disabled={forcingId === c.id}
                          className="flex items-center gap-0.5 text-xs text-orange-600 hover:text-orange-800 px-1 py-0.5 rounded"
                        >
                          停用
                        </button>
                        <button
                          onClick={() => onExtend(c.id)}
                          disabled={forcingId === c.id}
                          className="flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-800 px-1 py-0.5 rounded"
                        >
                          延期
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 0 && (
        <PaginationBar
          page={page}
          onPageChange={onPageChange}
          pageSize={pageSize}
          onPageSizeChange={onPageSizeChange}
          total={total}
          totalPages={totalPages}
        />
      )}
    </div>
  )
}
