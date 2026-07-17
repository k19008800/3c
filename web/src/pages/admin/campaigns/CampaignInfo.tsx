// ============================================================
//  CampaignInfo.tsx — 活动基本信息 + 代理分配面板
// ============================================================

import { useState } from 'react'
import { Calendar, DollarSign, Users, Plus } from 'lucide-react'
import type { Campaign, Allocation } from './types'
import { statusLabel, statusColor, statusOptions } from './types'
import AllocationFormModal from './AllocationFormModal'

interface CampaignInfoProps {
  campaign: Campaign
  allocations: Allocation[]
  onStatusChange: (newStatus: string) => void
  onRefresh: () => void
}

// ── 信息项展示 ──

function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
        <Icon size={20} className="text-slate-500" />
      </div>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm font-medium text-slate-800">{value}</p>
      </div>
    </div>
  )
}

// ── 分配表格行 ──

function AllocationRow({
  agentId,
  agentName,
  allocated,
  used,
  tokenAmount,
  validDays,
}: {
  agentId: number
  agentName: string
  allocated: number
  used: number
  tokenAmount: number
  validDays: number
}) {
  const usageRate =
    allocated > 0 ? Math.round((used / allocated) * 100) : 0

  return (
    <tr key={agentId} className="hover:bg-slate-50 transition">
      <td className="px-6 py-4 text-sm font-medium text-slate-900">
        {agentName}
      </td>
      <td className="px-6 py-4 text-sm text-slate-600 font-mono">
        {allocated.toLocaleString()}
      </td>
      <td className="px-6 py-4 text-sm text-slate-600 font-mono">
        {used.toLocaleString()}
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden min-w-[80px]">
            <div
              className={`h-full rounded-full transition-all ${
                usageRate >= 90
                  ? 'bg-red-500'
                  : usageRate >= 60
                    ? 'bg-amber-500'
                    : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(usageRate, 100)}%` }}
            />
          </div>
          <span
            className={`text-xs font-mono ${
              usageRate >= 90
                ? 'text-red-600'
                : usageRate >= 60
                  ? 'text-amber-600'
                  : 'text-green-600'
            }`}
          >
            {usageRate}%
          </span>
        </div>
      </td>
      <td className="px-6 py-4 text-sm text-slate-600 font-mono">
        {tokenAmount.toLocaleString()}
      </td>
      <td className="px-6 py-4 text-sm text-slate-600">{validDays}</td>
    </tr>
  )
}

// ── 分配表格 ──

function AllocationTable({
  allocations,
}: {
  allocations: Allocation[]
}) {
  if (allocations.length === 0) {
    return <div className="py-12 text-center text-slate-400">暂无代理分配</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-slate-50 text-left">
            <th className="px-6 py-3 text-sm font-medium text-slate-500">
              代理商
            </th>
            <th className="px-6 py-3 text-sm font-medium text-slate-500">
              分配数量
            </th>
            <th className="px-6 py-3 text-sm font-medium text-slate-500">
              已使用
            </th>
            <th className="px-6 py-3 text-sm font-medium text-slate-500">
              使用率
            </th>
            <th className="px-6 py-3 text-sm font-medium text-slate-500">
              Token 数量
            </th>
            <th className="px-6 py-3 text-sm font-medium text-slate-500">
              有效期 (天)
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {allocations.map((a) => (
            <AllocationRow
              key={a.agent_id}
              agentId={a.agent_id}
              agentName={a.agent_name}
              allocated={a.allocated}
              used={a.used}
              tokenAmount={a.token_amount}
              validDays={a.valid_days}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── 主组件 ──

export default function CampaignInfo({
  campaign,
  allocations,
  onStatusChange,
  onRefresh,
}: CampaignInfoProps) {
  const [showAllocModal, setShowAllocModal] = useState(false)

  return (
    <>
      {/* 基本信息面板 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">基本信息</h2>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                statusColor[campaign.status] || statusColor.draft
              }`}
            >
              {statusLabel[campaign.status] || campaign.status}
            </span>
            <select
              value={campaign.status}
              onChange={(e) => onStatusChange(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <InfoItem
            icon={Calendar}
            label="开始时间"
            value={
              campaign.start_at
                ? new Date(campaign.start_at).toLocaleString('zh-CN')
                : '未设置'
            }
          />
          <InfoItem
            icon={Calendar}
            label="结束时间"
            value={
              campaign.end_at
                ? new Date(campaign.end_at).toLocaleString('zh-CN')
                : '未设置'
            }
          />
          <InfoItem
            icon={DollarSign}
            label="预算金额"
            value={`¥${Number(campaign.budget_amount).toLocaleString()}`}
          />
          <InfoItem
            icon={Users}
            label="代理商分配"
            value={`${allocations.length} 个`}
          />
        </div>
      </div>

      {/* 代理分配面板 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">代理分配</h2>
          <button
            onClick={() => setShowAllocModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            <Plus size={16} />
            增加分配
          </button>
        </div>
        <AllocationTable allocations={allocations} />
      </div>

      {/* 分配 Modal */}
      {showAllocModal && (
        <AllocationFormModal
          campaignId={campaign.id}
          onClose={() => setShowAllocModal(false)}
          onSuccess={() => {
            setShowAllocModal(false)
            onRefresh()
          }}
        />
      )}
    </>
  )
}
