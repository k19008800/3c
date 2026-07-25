import { Loader2 } from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import ModelRow from './ModelRow'
import type { VendorModel } from '@/types'

interface ModelListProps {
  items: VendorModel[]
  loading: boolean
  total: number
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  onEdit: (item: VendorModel) => void
  onDelete: (item: VendorModel) => void
}

export default function ModelList({
  items,
  loading,
  total,
  page,
  totalPages,
  onPageChange,
  onPageSizeChange,
  onEdit,
  onDelete,
}: ModelListProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="text-center py-12">
          <Loader2 className="animate-spin inline-block" size={24} />
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="text-center py-12 text-slate-400">
          暂无供应商模型映射数据
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
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
              <ModelRow
                key={item.id}
                item={item}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <PaginationBar
          page={page}
          pageSize={20}
          total={total}
          totalPages={totalPages}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange || (() => undefined)}
        />
      )}
    </div>
  )
}