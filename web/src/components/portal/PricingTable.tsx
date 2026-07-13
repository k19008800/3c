import { useEffect, useState } from 'react'
import axios from 'axios'
import { Loader2, AlertCircle } from 'lucide-react'

interface VendorInfo {
  vendorId: number
  vendorName: string
  inputPrice: string
  outputPrice: string
}

interface ModelItem {
  id: number
  name: string
  displayName: string | null
  type: string
  vendors: VendorInfo[]
}

export default function PricingTable() {
  const [models, setModels] = useState<ModelItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    axios
      .get('/api/v1/models')
      .then((res) => {
        const list = res.data?.data?.list || res.data?.list || []
        setModels(list)
      })
      .catch((err) => setError(err.message || '获取定价数据失败'))
      .finally(() => setLoading(false))
  }, [])

  const flatRows = models.flatMap((model) =>
    (model.vendors || []).map((v) => ({
      modelName: model.name,
      modelDisplayName: model.displayName,
      modelType: model.type,
      vendorName: v.vendorName,
      inputPrice: Number(v.inputPrice || 0),
      outputPrice: Number(v.outputPrice || 0),
      _key: `${model.id}-${v.vendorId}`,
    })),
  )

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg">
        <AlertCircle size={18} />
        {error}
      </div>
    )
  }

  if (flatRows.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        暂无定价数据
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 text-left">
              <th className="px-6 py-4 text-sm font-medium text-slate-500">模型</th>
              <th className="px-6 py-4 text-sm font-medium text-slate-500">供应商</th>
              <th className="px-6 py-4 text-sm font-medium text-slate-500 text-right">
                输入价格
                <span className="block text-xs font-normal text-slate-400">/1K tokens</span>
              </th>
              <th className="px-6 py-4 text-sm font-medium text-slate-500 text-right">
                输出价格
                <span className="block text-xs font-normal text-slate-400">/1K tokens</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {flatRows.map((row) => (
              <tr key={row._key} className="hover:bg-slate-50/50 transition">
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-slate-900">{row.modelName}</div>
                  {row.modelDisplayName && (
                    <div className="text-xs text-slate-400">{row.modelDisplayName}</div>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">{row.vendorName}</td>
                <td className="px-6 py-4 text-sm text-slate-700 text-right font-mono">
                  ¥{row.inputPrice.toFixed(6)}
                </td>
                <td className="px-6 py-4 text-sm text-slate-700 text-right font-mono">
                  ¥{row.outputPrice.toFixed(6)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
