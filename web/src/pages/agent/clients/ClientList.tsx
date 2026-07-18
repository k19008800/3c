import { Loader2, RefreshCw, ChevronDown, ChevronRight, Download, Unlink } from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import ClientDetail from './ClientDetail'
import { type ClientListProps } from './types'

/**
 * 客户列表 — 分页表格 + 展开订单详情
 *
 * 【状态覆盖】
 *  - loading：全列 spinner
 *  - 空列表：提示文案
 *  - 正常渲染：表格行 + 展开操作
 *  - 展开行：渲染 ClientDetail（订单子表）
 */
export default function ClientList({
  clients,
  total,
  loading,
  page,
  pageSize,
  totalPages,
  expandedCustomerId,
  onToggleExpand,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  onExport,
  onUnbind,
}: ClientListProps) {
  // ── 状态徽章 ──
  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: 'bg-green-100 text-green-700',
      pending: 'bg-orange-100 text-orange-700',
      disabled: 'bg-red-100 text-red-700',
    }
    const labelMap: Record<string, string> = {
      active: '正常',
      pending: '未验证',
      disabled: '已禁用',
    }
    return (
      <span
        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
          map[status] || 'bg-slate-100 text-slate-500'
        }`}
      >
        {labelMap[status] || status}
      </span>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* ── 表头 ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <span className="text-sm font-medium text-slate-700">客户列表（{total}）</span>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
        >
          <RefreshCw size={14} />
          刷新
        </button>
      </div>

      {/* ── 表格 ── */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 text-left">
              <th className="px-4 py-3 text-sm font-medium text-slate-500 w-8"></th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">邮箱</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">昵称</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">余额</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">累计消费</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">贡献佣金</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">绑定时间</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr>
                <td colSpan={9} className="text-center py-12">
                  <Loader2 className="animate-spin inline-block" size={24} />
                </td>
              </tr>
            ) : clients.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-slate-400">
                  暂无绑定客户。使用推广链接邀请客户注册，或联系管理员手动绑定。
                </td>
              </tr>
            ) : (
              clients.map((c) => (
                <tr key={c.clientUserId} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onToggleExpand(c.clientUserId)}
                      className="text-slate-400 hover:text-slate-700 transition"
                      title="查看订单"
                    >
                      {expandedCustomerId === c.clientUserId ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-900">{c.email}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{c.nickname || '-'}</td>
                  <td className="px-4 py-3">{statusBadge(c.status)}</td>
                  <td className="px-4 py-3 text-sm font-medium">
                    ¥{Number(c.balance || 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    ¥{Number(c.totalCallCost || 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-green-600">
                    ¥{Number(c.totalCommission || 0).toFixed(4)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                    {c.boundAt
                      ? new Date(c.boundAt).toLocaleDateString('zh-CN')
                      : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onExport(c.clientUserId, c.email)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                        title="导出 CSV"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        onClick={() => onUnbind(c.clientUserId, c.email)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                        title="解绑客户"
                      >
                        <Unlink size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}

            {/* ── 展开的订单详情行 ── */}
            {expandedCustomerId !== null && (
              <tr>
                <td colSpan={9} className="px-4 py-3 bg-slate-50">
                  <ClientDetail customerUserId={expandedCustomerId} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── 分页 ── */}
      {total > 0 && (
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
