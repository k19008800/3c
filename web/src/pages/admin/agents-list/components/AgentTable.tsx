import { useNavigate } from 'react-router-dom'
import { Edit2, Trash2, Eye } from 'lucide-react'
import MiniChart from '@/components/ui/MiniChart'
import type { Agent } from '@/types'
import { buildCommissionTrend } from '../types'

interface AgentTableProps {
  agents: Agent[]
  onEdit: (a: Agent) => void
  onDelete: (a: Agent) => void
}

export default function AgentTable({ agents, onEdit, onDelete }: AgentTableProps) {
  const navigate = useNavigate()

  const getStatusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string }> = {
      active: { bg: 'bg-green-100', text: 'text-green-700' },
      inactive: { bg: 'bg-slate-100', text: 'text-slate-700' },
      banned: { bg: 'bg-red-100', text: 'text-red-700' },
    }
    const cfg = map[status] || map.inactive
    return (
      <span className={`px-2 py-1 rounded text-xs ${cfg.bg} ${cfg.text}`}>
        {status === 'active' ? '正常' : status === 'banned' ? '封禁' : '未激活'}
      </span>
    )
  }

  const fmtMoney = (v: string | number | null | undefined) => {
    const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0
    return `¥${n.toFixed(2)}`
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-4 py-3 text-left">ID</th>
            <th className="px-4 py-3 text-left">邮箱</th>
            <th className="px-4 py-3 text-left">昵称</th>
            <th className="px-4 py-3 text-right">余额</th>
            <th className="px-4 py-3 text-right">佣金</th>
            <th className="px-4 py-3 text-left">状态</th>
            <th className="px-4 py-3 text-left">趋势</th>
            <th className="px-4 py-3 text-left">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {agents.map((a) => (
            <tr key={a.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-600">{a.id}</td>
              <td className="px-4 py-3">
                <div className="text-slate-900">{a.email}</div>
              </td>
              <td className="px-4 py-3 text-slate-600">{a.nickname || '—'}</td>
              <td className="px-4 py-3 text-right font-mono">{fmtMoney(a.availableBalance || '0')}</td>
              <td className="px-4 py-3 text-right font-mono text-green-600">
                {fmtMoney(a.totalCommission)}
              </td>
              <td className="px-4 py-3">{getStatusBadge(typeof a.status === 'boolean' ? (a.status ? 'active' : 'inactive') : a.status || 'inactive')}</td>
              <td className="px-4 py-3">
                <MiniChart data={buildCommissionTrend(a)} width={80} height={24} />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/console/admin/agents/${a.id}`)}
                    className="p-1 text-slate-400 hover:text-blue-600"
                    title="详情"
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    onClick={() => onEdit(a)}
                    className="p-1 text-slate-400 hover:text-blue-600"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => onDelete(a)}
                    className="p-1 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}