import { useEffect, useState } from 'react'
import { get } from '@/lib/api'
import type { ModelItem } from '@/types'
import { Loader2, AlertCircle } from 'lucide-react'

export default function Models() {
  const [models, setModels] = useState<ModelItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    get<{ list: ModelItem[]; total: number }>('/api/v1/models')
      .then((res) => setModels(res.list))
      .catch((err) => setError(err.message || '获取模型列表失败'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">模型列表</h1>
        <span className="text-sm text-slate-500">共 {models.length} 个模型</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">模型名称</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">类型</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">供应商/价格</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {models.map((model) => (
                <tr key={model.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{model.name}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    <span className="bg-slate-100 px-2 py-0.5 rounded text-xs">{model.type}</span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="space-y-1">
                      {(model.vendors || []).map((v) => (
                        <div key={v.vendorId} className="flex items-center gap-2">
                          <span className="text-slate-600 font-medium">{v.vendorName}:</span>
                          <span className="text-slate-500">
                            输入 ¥{Number(v.inputPrice || 0).toFixed(6)} / 输出 ¥{Number(v.outputPrice || 0).toFixed(6)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      启用
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {models.length === 0 && (
          <div className="text-center py-12 text-slate-400">暂无模型数据</div>
        )}
      </div>
    </div>
  )
}
