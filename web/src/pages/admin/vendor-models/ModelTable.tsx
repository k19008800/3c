import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Edit3, Trash2, HeartPulse, Ban, Activity } from 'lucide-react'
import type { VendorModel } from '@/types'
import MiniChart from '@/components/ui/MiniChart'
import PaginationBar from '@/components/ui/PaginationBar'
import ConnectivityTest from './ConnectivityTest'
import { fmtPrice, fullPrice, generateTrendData } from './types'

/* ═══════════════════════════════════════════════════
   Health badge component
   ═══════════════════════════════════════════════════ */

function HealthBadge({ item }: { item: VendorModel }) {
  if (item.isDown) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
        <Ban size={12} />
        宕机
      </span>
    )
  }

  if (item.healthScore != null) {
    const score = Number(item.healthScore)
    const colorClass =
      score >= 0.8
        ? 'bg-green-100 text-green-700'
        : score >= 0.5
          ? 'bg-yellow-100 text-yellow-700'
          : 'bg-red-100 text-red-700'
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}
      >
        <HeartPulse size={12} />
        {(score * 100).toFixed(0)}%
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
      <Activity size={12} />
      未知
    </span>
  )
}

/* ═══════════════════════════════════════════════════
   Status toggle switch
   ═══════════════════════════════════════════════════ */

function StatusSwitch({
  status,
  onToggle,
}: {
  status: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
        status ? 'bg-green-500' : 'bg-slate-300'
      }`}
      title={status ? '点击禁用' : '点击启用'}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
          status ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

/* ═══════════════════════════════════════════════════
   Price cell with MiniChart trend
   ═══════════════════════════════════════════════════ */

function PriceCell({
  costInput,
  costOutput,
  sellInput,
  sellOutput,
  itemId,
}: {
  costInput: string
  costOutput: string
  sellInput: string
  sellOutput: string
  itemId: number
}) {
  const costTrend = useMemo(
    () => generateTrendData(Number(costInput) || Number(costOutput) || 0, 5, itemId),
    [costInput, costOutput, itemId]
  )
  const sellTrend = useMemo(
    () => generateTrendData(Number(sellInput) || Number(sellOutput) || 0, 5, itemId + 100),
    [sellInput, sellOutput, itemId]
  )

  return (
    <td className="px-3 py-3 text-sm whitespace-nowrap">
      <div className="flex items-center gap-2">
        <div>
          <span className="text-red-600" title={fullPrice(costInput)}>
            入 {fmtPrice(costInput)}
          </span>
          <br />
          <span className="text-red-400" title={fullPrice(costOutput)}>
            出 {fmtPrice(costOutput)}
          </span>
        </div>
        <div className="w-16 shrink-0">
          {costTrend.length > 0 && (
            <MiniChart
              data={costTrend}
              width={64}
              height={24}
              color="#ef4444"
              showDot={false}
              gradient={false}
            />
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <div>
          <span className="text-green-600" title={fullPrice(sellInput)}>
            入 {fmtPrice(sellInput)}
          </span>
          <br />
          <span className="text-green-400" title={fullPrice(sellOutput)}>
            出 {fmtPrice(sellOutput)}
          </span>
        </div>
        <div className="w-16 shrink-0">
          {sellTrend.length > 0 && (
            <MiniChart
              data={sellTrend}
              width={64}
              height={24}
              color="#22c55e"
              showDot={false}
              gradient={false}
            />
          )}
        </div>
      </div>
    </td>
  )
}

/* ═══════════════════════════════════════════════════
   Main table component
   ═══════════════════════════════════════════════════ */

interface ModelTableProps {
  items: VendorModel[]
  loading: boolean
  error: string
  page: number
  pageSize: number
  total: number
  totalPages: number
  onEdit: (item: VendorModel) => void
  onDelete: (item: VendorModel) => void
  onToggleStatus: (item: VendorModel) => void
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

export default function ModelTable({
  items,
  loading,
  error,
  page,
  pageSize,
  total,
  totalPages,
  onEdit,
  onDelete,
  onToggleStatus,
  onPageChange,
  onPageSizeChange,
}: ModelTableProps) {
  const empty = !loading && items.length === 0

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 text-sm border-b border-red-100">
          <span className="shrink-0">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </span>
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 text-left">
              <th className="px-3 py-3 text-sm font-medium text-slate-500 w-12">
                ID
              </th>
              <th className="px-3 py-3 text-sm font-medium text-slate-500">
                供应商
              </th>
              <th className="px-3 py-3 text-sm font-medium text-slate-500">
                模型
              </th>
              <th className="px-3 py-3 text-sm font-medium text-slate-500">
                上游名称
              </th>
              <th className="px-3 py-3 text-sm font-medium text-slate-500 hidden xl:table-cell">
                接口地址
              </th>
              <th className="px-3 py-3 text-sm font-medium text-slate-500">
                成本价 / 售价 (元/百万token)
              </th>
              <th className="px-3 py-3 text-sm font-medium text-slate-500">
                权重
              </th>
              <th className="px-3 py-3 text-sm font-medium text-slate-500">
                RPM/TPM
              </th>
              <th className="px-3 py-3 text-sm font-medium text-slate-500">
                健康
              </th>
              <th className="px-3 py-3 text-sm font-medium text-slate-500">
                状态
              </th>
              <th className="px-3 py-3 text-sm font-medium text-slate-500">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr>
                <td colSpan={11} className="text-center py-12">
                  <Loader2 className="animate-spin inline-block" size={24} />
                </td>
              </tr>
            ) : empty ? (
              <tr>
                <td colSpan={11} className="text-center py-12 text-slate-400">
                  暂无供应商模型映射数据
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition">
                  <td className="px-3 py-3 text-sm text-slate-400">
                    {item.id}
                  </td>
                  <td className="px-3 py-3 text-sm text-slate-900">
                    <Link
                      to="/admin/vendors"
                      className="hover:text-blue-600 hover:underline transition"
                      title="查看供应商详情"
                    >
                      {item.vendorName || `#${item.vendorId}`}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-sm text-slate-600">
                    <Link
                      to="/admin/models"
                      className="hover:text-blue-600 hover:underline transition"
                      title="查看模型详情"
                    >
                      {item.modelName || `#${item.modelId}`}
                    </Link>
                  </td>
                  <td
                    className="px-3 py-3 text-sm text-slate-700 font-mono max-w-[140px] truncate"
                    title={item.upstreamModelName}
                  >
                    {item.upstreamModelName}
                  </td>
                  <td
                    className="px-3 py-3 text-sm text-slate-400 font-mono max-w-[160px] truncate hidden xl:table-cell"
                    title={item.apiEndpoint}
                  >
                    {item.apiEndpoint}
                  </td>
                  <PriceCell
                    costInput={item.costPriceInput}
                    costOutput={item.costPriceOutput}
                    sellInput={item.sellPriceInput}
                    sellOutput={item.sellPriceOutput}
                    itemId={item.id}
                  />
                  <td className="px-3 py-3 text-sm text-slate-600">
                    {item.weight}
                  </td>
                  <td className="px-3 py-3 text-sm text-slate-500">
                    {item.rpmLimit || item.tpmLimit
                      ? `${item.rpmLimit ? `${item.rpmLimit}/m` : '—'}${
                          item.tpmLimit ? ` | ${item.tpmLimit}/m` : ''
                        }`
                      : '—'}
                  </td>
                  <td className="px-3 py-3">
                    <HealthBadge item={item} />
                  </td>
                  <td className="px-3 py-3">
                    <StatusSwitch
                      status={item.status}
                      onToggle={() => onToggleStatus(item)}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <ConnectivityTest vendorModelId={item.id} />
                      <button
                        onClick={() => onEdit(item)}
                        className="p-1 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded transition"
                        title="编辑"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => onDelete(item)}
                        className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition"
                        title="下架"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
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
