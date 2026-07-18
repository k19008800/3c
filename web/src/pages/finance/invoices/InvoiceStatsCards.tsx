import { Plus } from 'lucide-react'

interface Props {
  availableAmount: string
  onApply: () => void
}

function formatAmount(val: string): string {
  return Number(val).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function InvoiceStatsCards({ availableAmount, onApply }: Props) {
  const canApply = parseFloat(availableAmount) > 0

  return (
    <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl shadow-sm p-6 text-white">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-indigo-100">可开票额度</p>
          <p className="text-3xl font-bold mt-1">
            ¥ {formatAmount(availableAmount)}
          </p>
          <p className="text-xs text-indigo-200 mt-1">
            累计充值金额 - 已开票金额
          </p>
        </div>
        <button
          onClick={onApply}
          disabled={!canApply}
          className="flex items-center gap-1.5 px-5 py-2.5 bg-white text-indigo-600 rounded-lg font-medium text-sm hover:bg-indigo-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus size={16} /> 申请开票
        </button>
      </div>
    </div>
  )
}
