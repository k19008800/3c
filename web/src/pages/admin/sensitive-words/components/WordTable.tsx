import { Edit2, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { SensitiveWord } from '../types'
import { CATEGORIES, SEVERITIES } from '../types'

interface WordTableProps {
  words: SensitiveWord[]
  onEdit: (word: SensitiveWord) => void
  onDelete: (id: number) => void
  onToggle: (id: number, enabled: boolean) => void
}

export default function WordTable({ words, onEdit, onDelete, onToggle }: WordTableProps) {
  const getCategoryLabel = (value: string) => {
    return CATEGORIES.find((c) => c.value === value)?.label || value
  }

  const getSeverityStyle = (value: string) => {
    return SEVERITIES.find((s) => s.value === value)?.color || 'bg-slate-100 text-slate-700'
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-4 py-3 text-left">词汇</th>
            <th className="px-4 py-3 text-left">分类</th>
            <th className="px-4 py-3 text-left">严重度</th>
            <th className="px-4 py-3 text-left">命中次数</th>
            <th className="px-4 py-3 text-left">状态</th>
            <th className="px-4 py-3 text-left">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {words.map((word) => (
            <tr key={word.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">{word.word}</div>
                {word.description && (
                  <div className="text-xs text-slate-500 mt-0.5">{word.description}</div>
                )}
              </td>
              <td className="px-4 py-3">
                <Badge variant="outline">{getCategoryLabel(word.category)}</Badge>
              </td>
              <td className="px-4 py-3">
                <span className={`px-2 py-1 rounded text-xs ${getSeverityStyle(word.severity)}`}>
                  {SEVERITIES.find((s) => s.value === word.severity)?.label || word.severity}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-600">
                {word.hitCount.toLocaleString()}
                {word.lastHitAt && (
                  <div className="text-xs text-slate-400">
                    {new Date(word.lastHitAt).toLocaleDateString()}
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                <Badge variant={word.enabled ? 'default' : 'secondary'}>
                  {word.enabled ? '启用' : '禁用'}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onToggle(word.id, !word.enabled)}
                    className="p-1 text-slate-400 hover:text-blue-600"
                    title={word.enabled ? '禁用' : '启用'}
                  >
                    {word.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  </button>
                  <button
                    onClick={() => onEdit(word)}
                    className="p-1 text-slate-400 hover:text-blue-600"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => onDelete(word.id)}
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