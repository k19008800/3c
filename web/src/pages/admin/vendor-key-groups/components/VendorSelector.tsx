import React, { memo } from 'react'
import type { Vendor, VendorSummary } from '../hooks/useVendorKeyGroups'
import { vendorTypeLabels } from '../utils'

interface VendorSelectorProps {
  vendors: Vendor[]
  vendorSummaries: VendorSummary[]
  selectedVendorId: number | null
  loading: boolean
  onSelect: (vendorId: number) => void
  onRefresh: () => void
}

const VendorSelector: React.FC<VendorSelectorProps> = memo(({
  vendors,
  vendorSummaries,
  selectedVendorId,
  loading,
  onSelect,
  onRefresh
}) => {
  const getVendorSummary = (vendorId: number) => {
    return vendorSummaries.find(s => s.vendorId === vendorId)
  }

  const getVendorTypeLabel = (type: string) => {
    return vendorTypeLabels[type as keyof typeof vendorTypeLabels] || type
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">选择供应商</h2>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition disabled:opacity-50"
        >
          <span className={`${loading ? 'animate-spin' : ''}`}>⟳</span>
          刷新
        </button>
      </div>

      {loading && vendors.length === 0 ? (
        <div className="text-center py-6">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500"></div>
          <p className="mt-2 text-slate-500 text-sm">加载供应商中...</p>
        </div>
      ) : vendors.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-slate-500">暂无供应商数据</p>
          <button
            onClick={onRefresh}
            className="mt-2 text-sm text-blue-600 hover:text-blue-800"
          >
            点击刷新
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {vendors.map(vendor => {
            const summary = getVendorSummary(vendor.id)
            const isSelected = selectedVendorId === vendor.id
            
            return (
              <button
                key={vendor.id}
                onClick={() => onSelect(vendor.id)}
                className={`p-4 rounded-lg border transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-slate-900">{vendor.name}</h3>
                      <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                        {getVendorTypeLabel(vendor.type)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mb-3">
                      {vendor.description || '暂无描述'}
                    </p>
                    
                    {summary && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-slate-100 rounded px-2 py-1">
                          <div className="text-slate-500">分组数</div>
                          <div className="font-medium">{summary.groupCount}</div>
                        </div>
                        <div className="bg-slate-100 rounded px-2 py-1">
                          <div className="text-slate-500">密钥数</div>
                          <div className="font-medium">{summary.keyCount}</div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {isSelected && (
                    <div className="w-2 h-2 rounded-full bg-blue-500 ml-2"></div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
})

VendorSelector.displayName = 'VendorSelector'

export default VendorSelector