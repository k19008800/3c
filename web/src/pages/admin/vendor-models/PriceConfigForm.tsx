import { useMemo } from 'react'

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
        {renderField('成本价 (输入)', 'costPriceInput', costPriceInput)}
        {renderField('成本价 (输出)', 'costPriceOutput', costPriceOutput)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {renderField('售价 (输入)', 'sellPriceInput', sellPriceInput)}
        {renderField('售价 (输出)', 'sellPriceOutput', sellPriceOutput)}
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
    </div>
  )
}
