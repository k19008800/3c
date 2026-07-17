// ============================================================
//  CampaignList.tsx — 活动列表（含表格 + 分页 + 操作按钮）
// ============================================================

import { useCallback } from 'react'
import { Eye, Pencil, XCircle, Loader2 } from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import type { Campaign } from './types'
import { statusLabel, statusColor } from './types'

interface CampaignListProps {
  campaigns: Campaign[]
  loading: boolean
  error: string
  total: number
  page: number
  pageSize: number
  totalPages: number
  /** 查看详情 */
  onView: (id: number) => void
  /** 编辑活动 */
  onEdit: (campaign: Campaign) => void
  /** 确认提前结束 */
  onEndConfirm: (id: number) => void
  /** 翻页 */
  onPageChange: (page: number) => void
  /** 切换每页条数 */
  onPageSizeChange: (size: number) => void
}

/** 表格行 */
function CampaignRow({
  campaign,
  onView,
  onEdit,
  onEndConfirm,
}: {
  campaign: Campaign
  onView: (id: number) => void
  onEdit: (c: Campaign) => void
  onEndConfirm: (id: number) => void
}) {
  return (
    <tr className="hover:bg-slate-50 transition">
      <td className="px-4 py-3 text-sm text-slate-600">{campaign.id}</td>
      <td className="px-4 py-3 text-sm text-slate-900 font-medium max-w-[200px] truncate">
        {campaign.name}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
            statusColor[campaign.status] || statusColor.draft
          }`}
        >
          {statusLabel[campaign.status] || campaign.status}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
        {campaign.start_at
          ? new Date(campaign.start_at).toLocaleDateString('zh-CN')
          : '-'}
      </td>
      <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
        {campaign.end_at
          ? new Date(campaign.end_at).toLocaleDateString('zh-CN')
          : '-'}
      </td>
      <td className="px-4 py-3 text-sm text-slate-600 font-mono">
        {(Number(campaign.budget_amount) || 0).toLocaleString()}
      </td>
      <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
        {new Date(campaign.createdAt).toLocaleDateString('zh-CN')}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onView(campaign.id)}
            className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
          >
            <Eye size={14} />
            详情
          </button>
          <button
            onClick={() => onEdit(campaign)}
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
          >
            <Pencil size={14} />
            编辑
          </button>
          {campaign.status === 'active' && (
            <button
              onClick={() => onEndConfirm(campaign.id)}
              className="flex items-center gap-1 text-sm text-amber-600 hover:text-amber-800"
            >
              <XCircle size={14} />
              提前结束
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

export default function CampaignList({
  campaigns,
  loading,
  error,
  total,
  page,
  pageSize,
  totalPages,
  onView,
  onEdit,
  onEndConfirm,
  onPageChange,
  onPageSizeChange,
}: CampaignListProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 text-left">
              <th className="px-4 py-3 text-sm font-medium text-slate-500">ID</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">名称</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">开始时间</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">结束时间</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">预算 (￥)</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-12">
                  <Loader2 className="animate-spin inline-block" size={24} />
                </td>
              </tr>
            ) : campaigns.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-slate-400">
                  暂无活动
                </td>
              </tr>
            ) : (
              campaigns.map((c) => (
                <CampaignRow
                  key={c.id}
                  campaign={c}
                  onView={onView}
                  onEdit={onEdit}
                  onEndConfirm={onEndConfirm}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

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
