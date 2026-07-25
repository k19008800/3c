import { useMemo, useState } from 'react'
import { Lightbulb, ChevronDown, ChevronUp } from 'lucide-react'

interface PriceConfigFormProps {
  costPriceInput: string
  costPriceOutput: string
  sellPriceInput: string
  sellPriceOutput: string
  onChange: (field: string, value: string) => void
  /** 是否显示利润预览，默认 true */
  showProfitPreview?: boolean
}

export default function PriceConfigForm({
  costPriceInput,
  costPriceOutput,
  sellPriceInput,
  sellPriceOutput,
  onChange,
  showProfitPreview = true,
}: PriceConfigFormProps) {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const profitMargin = useMemo(() => {
    const ci = parseFloat(costPriceInput) || 0
    const co = parseFloat(costPriceOutput) || 0
    const si = parseFloat(sellPriceInput) || 0
    const so = parseFloat(sellPriceOutput) || 0
    return { inputMargin: si - ci, outputMargin: so - co }
  }, [costPriceInput, costPriceOutput, sellPriceInput, sellPriceOutput])

  const renderField = (
    label: string,
    field: string,
    value: string,
    placeholder = '0.0'
  ) => (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      <input
        type="number"
        step="0.000001"
        min="0"
        value={value}
        onChange={(e) => onChange(field, e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )

  return (
    <div className="bg-slate-50 rounded-lg p-3 space-y-3">
      <p className="text-xs text-slate-500 font-medium">价格设置</p>
      <div className="grid grid-cols-2 gap-3">
        {renderField('成本价(输入)(元/百万token)', 'costPriceInput', costPriceInput)}
        {renderField('成本价(输出)(元/百万token)', 'costPriceOutput', costPriceOutput)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {renderField('售价(输入)(元/百万token)', 'sellPriceInput', sellPriceInput)}
        {renderField('售价(输出)(元/百万token)', 'sellPriceOutput', sellPriceOutput)}
      </div>
      {showProfitPreview &&
        (profitMargin.inputMargin !== 0 || profitMargin.outputMargin !== 0) && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">毛利预览：</span>
            <span
              className={
                profitMargin.inputMargin >= 0
                  ? 'text-green-600'
                  : 'text-red-600'
              }
            >
              输入{' '}
              {profitMargin.inputMargin >= 0 ? '+' : ''}
              {profitMargin.inputMargin.toFixed(6)}
            </span>
            <span className="text-slate-300">|</span>
            <span
              className={
                profitMargin.outputMargin >= 0
                  ? 'text-green-600'
                  : 'text-red-600'
              }
            >
              输出{' '}
              {profitMargin.outputMargin >= 0 ? '+' : ''}
              {profitMargin.outputMargin.toFixed(6)}
            </span>
          </div>
        )}

      {/* 智能定价建议 */}
      <div className="border-t border-slate-200 pt-2">
        <button
          onClick={() => setShowSuggestions(!showSuggestions)}
          className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-800"
        >
          <Lightbulb size={12} />
          智能定价建议
          {showSuggestions ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {showSuggestions && (
          <div className="mt-2 space-y-1.5">
            {SuggestionRow('输入', costPriceInput, sellPriceInput, onChange, 'sellPriceInput')}
            {SuggestionRow('输出', costPriceOutput, sellPriceOutput, onChange, 'sellPriceOutput')}
            <p className="text-[10px] text-slate-400 mt-1">
              建议基于成本价 + 行业利润率 (15%~30%) 计算。点击建议价自动填入售价。
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function SuggestionRow(
  label: string,
  costPrice: string,
  sellPrice: string,
  onChange: (field: string, value: string) => void,
  sellField: string
) {
  const cost = parseFloat(costPrice) || 0
  if (cost <= 0) return null

  const suggestions = [
    { margin: 0.15, label: '15%' },
    { margin: 0.20, label: '20%' },
    { margin: 0.25, label: '25%' },
    { margin: 0.30, label: '30%' },
  ]

  return (
    <div className="text-xs">
      <span className="text-slate-500">{label}：</span>
      <div className="flex items-center gap-1.5 mt-0.5">
        {suggestions.map((s) => {
          const suggested = (cost * (1 + s.margin)).toFixed(6)
          const isActive = Math.abs((parseFloat(sellPrice) || 0) - parseFloat(suggested)) < 0.000001
          return (
            <button
              key={s.margin}
              onClick={() => onChange(sellField, suggested)}
              className={`px-1.5 py-0.5 rounded border text-xs transition ${
                isActive
                  ? 'bg-amber-100 border-amber-300 text-amber-700'
                  : 'border-slate-200 text-slate-500 hover:border-amber-300 hover:text-amber-600'
              }`}
            >
              利润率{s.label}：{suggested}
            </button>
          )
        })}
        <span className="text-slate-300">|</span>
        <span className="text-slate-400">当前售价：{sellPrice || '—'}</span>
      </div>
    </div>
  )
}
