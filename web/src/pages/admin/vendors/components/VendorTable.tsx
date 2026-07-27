import { Edit2, Trash2, RefreshCw, Wifi, WifiOff, Wrench } from 'lucide-react'
import type { Vendor } from '@/types'
import { getStatusBadge } from '../types'

interface VendorTableProps {
  vendors: Vendor[]
  onEdit: (v: Vendor) => void
  onDelete: (v: Vendor) => void
  onSync: (v: Vendor) => void
  onStatusSwitch: (v: Vendor, status: 'active' | 'maintenance' | 'offline') => void
}

const STATUS_ACTIONS: { status: 'active' | 'maintenance' | 'offline'; icon: React.ReactNode; label: string; color: string }[] = [
  { status: 'active', icon: <Wifi size={14} />, label: '上线', color: 'text-green-600 hover:bg-green-50' },
  { status: 'maintenance', icon: <Wrench size={14} />, label: '维护', color: 'text-amber-600 hover:bg-amber-50' },
  { status: 'offline', icon: <WifiOff size={14} />, label: '下线', color: 'text-red-600 hover:bg-red-50' },
]

export default function VendorTable({ vendors, onEdit, onDelete, onSync, onStatusSwitch }: VendorTableProps) {
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
                  <div className="flex items-center gap-1">
                    {/* 状态切换按钮 */}
                    {STATUS_ACTIONS.filter(a => a.status !== (v.status || 'active')).map(a => (
                      <button
                        key={a.status}
                        onClick={() => onStatusSwitch(v, a.status)}
                        className={`p-1.5 rounded-lg text-xs transition ${a.color}`}
                        title={`切换${a.label}`}
                      >
                        {a.icon}
                      </button>
                    ))}
                    <span className="w-px h-4 bg-slate-200 mx-1" />
                    <button
                      onClick={() => onSync(v)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition"
                      title="同步模型"
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button
                      onClick={() => onEdit(v)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => onDelete(v)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition"
                    >
                      <Trash2 size={14} />
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
