import { Edit2, Trash2, RefreshCw } from 'lucide-react'
import type { Vendor } from '@/types'
import { getStatusBadge } from '../types'

interface VendorTableProps {
  vendors: Vendor[]
  onEdit: (v: Vendor) => void
  onDelete: (v: Vendor) => void
  onSync: (v: Vendor) => void
}

export default function VendorTable({ vendors, onEdit, onDelete, onSync }: VendorTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-4 py-3 text-left">ID</th>
            <th className="px-4 py-3 text-left">名称</th>
            <th className="px-4 py-3 text-left">Base URL</th>
            <th className="px-4 py-3 text-left">状态</th>
            <th className="px-4 py-3 text-left">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {vendors.map((v) => {
            const badge = getStatusBadge(v.status || 'active')
            return (
              <tr key={v.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-600">{v.id}</td>
                <td className="px-4 py-3">
                  <div className="text-slate-900">{v.name}</div>
                  {v.description && (
                    <div className="text-xs text-slate-500">{v.description}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600 font-mono text-xs">{v.baseUrl || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs ${badge.className}`}>
                    {badge.label}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onSync(v)}
                      className="p-1 text-slate-400 hover:text-blue-600"
                      title="同步模型"
                    >
                      <RefreshCw size={16} />
                    </button>
                    <button
                      onClick={() => onEdit(v)}
                      className="p-1 text-slate-400 hover:text-blue-600"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => onDelete(v)}
                      className="p-1 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}