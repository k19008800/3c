import type { VendorSummary } from '../types'

interface VendorSelectorProps {
  vendors: Array<{ id: number; name: string }>
  vendorSummaries: VendorSummary[]
  selectedVendorId: number | null
  onSelectVendor: (vendorId: number | null) => void
  getVendorSummary: (vendorId: number) => VendorSummary | undefined
}

export default function VendorSelector({
  vendors,
  vendorSummaries,
  selectedVendorId,
  onSelectVendor,
  getVendorSummary,
}: VendorSelectorProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <label className="block text-sm font-medium text-slate-700 mb-2">选择供应商</label>
      <select
        value={selectedVendorId ?? ''}
        onChange={e => {
          onSelectVendor(e.target.value ? Number(e.target.value) : null)
        }}
        className="w-full max-w-md px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
      >
        <option value="">-- 请选择 --</option>
        {vendors.map(v => {
          const summary = getVendorSummary(v.id)
          const label = summary
            ? `${v.name} (${summary.groupCount}组 / ${summary.keyCount}个Key)`
            : v.name
          return <option key={v.id} value={v.id}>{label}</option>
        })}
      </select>
    </div>
  )
}