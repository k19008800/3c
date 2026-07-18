import { useMemo } from 'react'
import type { DashboardHealth } from '@/types'
import {
  AlertTriangle,
  CheckCircle2,
  Wifi,
  XCircle,
  TrendingUp,
} from 'lucide-react'
import { healthColor } from './types'

/* ── Props ── */
interface Props {
  health: DashboardHealth
}

/* ════════════════════════════════════════
   ServiceList
   Vendor distribution + Unhealthy models + Recovering
   ════════════════════════════════════════ */
export default function ServiceList({ health }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <VendorDistributionCard health={health} />
      <UnhealthyModelsCard health={health} />
    </div>
  )
}

/* ── Vendor Distribution ── */
function VendorDistributionCard({ health }: Props) {
  const { vendors } = health
  const entries = useMemo(
    () => Object.entries(vendors.statusDistribution) as [string, number][],
    [vendors.statusDistribution],
  )

  const avgColor = useMemo(() => healthColor(vendors.avgHealthScore), [vendors.avgHealthScore])

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Wifi size={16} className="text-slate-600" />
        <h3 className="text-sm font-semibold text-slate-700">厂商分布</h3>
      </div>
      <div className="space-y-2">
        {entries.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-2">暂无数据</p>
        ) : (
          entries.map(([status, count]) => (
            <VendorStatusRow key={status} status={status} count={count} />
          ))
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-slate-500">平均健康评分</span>
          <span className={`font-semibold ${avgColor.split(' ')[0]}`}>
            {vendors.avgHealthScore}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">活跃模型 / 宕机</span>
          <span className="text-slate-700">
            {vendors.totalActiveModels}
            {vendors.downModelCount > 0 && (
              <span className="text-red-500 ml-1">(↓{vendors.downModelCount})</span>
            )}
          </span>
        </div>
      </div>
    </div>
  )
}

function VendorStatusRow({ status, count }: { status: string; count: number }) {
  const dotColor =
    status === 'active'
      ? 'bg-green-500'
      : status === 'degraded'
        ? 'bg-yellow-500'
        : status === 'down'
          ? 'bg-red-500'
          : 'bg-slate-300'

  const label =
    status === 'active'
      ? '正常'
      : status === 'degraded'
        ? '降级'
        : status === 'down'
          ? '宕机'
          : status

  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-xs text-slate-600">
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        {label}
      </span>
      <span className="text-xs font-medium text-slate-800">{count}</span>
    </div>
  )
}

/* ── Unhealthy Models ── */
function UnhealthyModelsCard({ health }: Props) {
  const { vendors } = health
  const hasUnhealthy = vendors.unhealthyModels.length > 0
  const hasRecovering = vendors.recovering.length > 0

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 lg:col-span-2">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle
          size={16}
          className={hasUnhealthy ? 'text-amber-500' : 'text-green-500'}
        />
        <h3 className="text-sm font-semibold text-slate-700">
          异常厂商模型
          {hasUnhealthy && (
            <span className="ml-1.5 text-xs font-normal text-slate-400">
              ({vendors.unhealthyModels.length})
            </span>
          )}
        </h3>
      </div>

      {!hasUnhealthy ? (
        <div className="flex items-center justify-center gap-2 py-6 text-green-600">
          <CheckCircle2 size={18} />
          <span className="text-sm">所有厂商运行正常</span>
        </div>
      ) : (
        <UnhealthyModelsTable models={vendors.unhealthyModels} />
      )}

      {hasRecovering && <RecoveringSection models={vendors.recovering} />}
    </div>
  )
}

/* ── Unhealthy Models Table ── */
function UnhealthyModelsTable({
  models,
}: {
  models: DashboardHealth['vendors']['unhealthyModels']
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-400">
            <th className="pb-2 pr-2 font-medium">厂商</th>
            <th className="pb-2 pr-2 font-medium">模型</th>
            <th className="pb-2 pr-2 font-medium">评分</th>
            <th className="pb-2 pr-2 font-medium">状态</th>
            <th className="pb-2 pr-2 font-medium">恢复中</th>
            <th className="pb-2 font-medium">上次检测</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {models.map((m) => (
            <UnhealthyModelRow key={`${m.vendorName}-${m.upstreamModelName}`} model={m} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function UnhealthyModelRow({
  model,
}: {
  model: DashboardHealth['vendors']['unhealthyModels'][number]
}) {
  const scoreColors = useMemo(() => healthColor(model.healthScore), [model.healthScore])

  return (
    <tr className="hover:bg-slate-50">
      <td className="py-2 pr-2 text-slate-700">{model.vendorName}</td>
      <td
        className="py-2 pr-2 text-slate-600 max-w-[120px] truncate"
        title={model.modelName}
      >
        {model.modelName}
      </td>
      <td className="py-2 pr-2">
        <span
          className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${scoreColors}`}
        >
          {model.healthScore}
        </span>
      </td>
      <td className="py-2 pr-2">
        <span
          className={`inline-flex items-center gap-1 text-[10px] ${model.isDown ? 'text-red-600' : 'text-yellow-600'}`}
        >
          {model.isDown ? <XCircle size={11} /> : <AlertTriangle size={11} />}
          {model.isDown ? '宕机' : '降级'}
        </span>
      </td>
      <td className="py-2 pr-2">
        {model.consecutiveSuccess && model.consecutiveSuccess > 0 ? (
          <span className="text-green-600 text-[10px]">
            {model.consecutiveSuccess}/3
          </span>
        ) : (
          <span className="text-slate-300">-</span>
        )}
      </td>
      <td className="py-2 text-slate-400 text-[10px] whitespace-nowrap">
        {model.lastCheckAgo !== null ? `${model.lastCheckAgo}s前` : '-'}
      </td>
    </tr>
  )
}

/* ── Recovering Section ── */
function RecoveringSection({
  models,
}: {
  models: DashboardHealth['vendors']['recovering']
}) {
  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <div className="flex items-center gap-1.5 mb-2">
        <TrendingUp size={14} className="text-green-500" />
        <span className="text-xs font-medium text-green-700">恢复中</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {models.map((r) => (
          <span
            key={`${r.vendorName}-${r.upstreamModelName}`}
            className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-full text-[10px]"
          >
            {r.vendorName}/{r.modelName}
            <span className="font-semibold">{r.consecutiveSuccess}/3</span>
          </span>
        ))}
      </div>
    </div>
  )
}
