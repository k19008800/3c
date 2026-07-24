import { Loader2, Edit3, Trash2, Ban, HeartPulse, Activity } from 'lucide-react'
import type { VendorModel } from '@/types'

interface ModelTableProps {
  items: VendorModel[]
  loading: boolean
  onEdit: (item: VendorModel) => void
  onDelete: (item: VendorModel) => void
}

export default function ModelTable({ items, loading, onEdit, onDelete }: ModelTableProps) {
  if (loading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="animate-spin inline-block" size={24} />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        暂无供应商模型映射数据
      </div>
    )
  }

  return (
    <table className="w-full">
      <thead>
        <tr className="bg-slate-50 text-left">
          <th className="px-4 py-3 text-sm font-medium text-slate-500">ID</th>
          <th className="px-4 py-3 text-sm font-medium text-slate-500">供应商</th>
          <th className="px-4 py-3 text-sm font-medium text-slate-500">模型</th>
          <th className="px-4 py-3 text-sm font-medium text-slate-500">上游名称</th>
          <th className="px-4 py-3 text-sm font-medium text-slate-500">接口地址</th>
          <th className="px-4 py-3 text-sm font-medium text-slate-500">成本价</th>
          <th className="px-4 py-3 text-sm font-medium text-slate-500">售价</th>
          <th className="px-4 py-3 text-sm font-medium text-slate-500">权重</th>
          <th className="px-4 py-3 text-sm font-medium text-slate-500">RPM/TPM</th>
          <th className="px-4 py-3 text-sm font-medium text-slate-500">健康</th>
          <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
          <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200">
        {items.map((item) => (
          <tr key={item.id} className="hover:bg-slate-50 transition">
            <td className="px-4 py-3 text-sm text-slate-600">{item.id}</td>
            <td className="px-4 py-3 text-sm text-slate-900">{item.vendorName || '-'}</td>
            <td className="px-4 py-3 text-sm text-slate-600">{item.modelName || '-'}</td>
            <td className="px-4 py-3 text-sm text-slate-700 font-mono max-w-[160px] truncate" title={item.upstreamModelName}>
              {item.upstreamModelName}
            </td>
            <td className="px-4 py-3 text-sm text-slate-500 font-mono max-w-[180px] truncate" title={item.apiEndpoint}>
              {item.apiEndpoint}
            </td>
            <td className="px-4 py-3 text-sm whitespace-nowrap">
              <span className="text-red-600">入 {Number(item.costPriceInput).toFixed(6)}</span>
              <br />
              <span className="text-red-400">出 {Number(item.costPriceOutput).toFixed(6)}</span>
            </td>
            <td className="px-4 py-3 text-sm whitespace-nowrap">
              <span className="text-green-600">入 {Number(item.sellPriceInput).toFixed(6)}</span>
              <br />
              <span className="text-green-400">出 {Number(item.sellPriceOutput).toFixed(6)}</span>
            </td>
            <td className="px-4 py-3 text-sm text-slate-600">{item.weight}</td>
            <td className="px-4 py-3 text-sm text-slate-600">
              {item.rpmLimit || item.tpmLimit
                ? `${item.rpmLimit ? `${item.rpmLimit}/m` : '-'}${item.tpmLimit ? ` | ${item.tpmLimit}/m` : ''}`
                : '-'}
            </td>
            <td className="px-4 py-3">
              {item.isDown ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                  <Ban size={12} />
                  宕机
                </span>
              ) : item.healthScore ? (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  parseFloat(item.healthScore) >= 80 ? 'bg-green-100 text-green-700' :
                  parseFloat(item.healthScore) >= 50 ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  <HeartPulse size={12} />
                  {Number(item.healthScore).toFixed(0)}%
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                  <Activity size={12} />
                  未知
                </span>
              )}
            </td>
            <td className="px-4 py-3">
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                item.status ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {item.status ? '启用' : '禁用'}
              </span>
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onEdit(item)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                  title="编辑"
                >
                  <Edit3 size={15} />
                </button>
                <button
                  onClick={() => onDelete(item)}
                  className="text-sm text-red-600 hover:text-red-800"
                  title="删除"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}