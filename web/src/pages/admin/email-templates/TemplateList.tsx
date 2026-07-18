import { useMemo } from 'react'
import { Edit3, Trash2, Loader2 } from 'lucide-react'
import type { EmailTemplate } from './types'
import { TEMPLATE_LABELS, TEMPLATE_ORDER } from './types'

interface TemplateListProps {
  templates: EmailTemplate[]
  loading: boolean
  error: string
  onEdit: (tmpl: EmailTemplate) => void
  onDelete: (tmpl: EmailTemplate) => void
}

export default function TemplateList({ templates, loading, onEdit, onDelete }: TemplateListProps) {
  const sortedTemplates = useMemo(() => {
    return [...templates].sort((a, b) => {
      const ia = TEMPLATE_ORDER.indexOf(a.name)
      const ib = TEMPLATE_ORDER.indexOf(b.name)
      if (ia !== -1 && ib !== -1) return ia - ib
      if (ia !== -1) return -1
      if (ib !== -1) return 1
      return a.name.localeCompare(b.name)
    })
  }, [templates])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 text-left">
              <th className="px-4 py-3 text-sm font-medium text-slate-500">模板名称</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">中文主题</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">英文主题</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">更新时间</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {sortedTemplates.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-slate-400">
                  暂无邮件模板，请先创建
                </td>
              </tr>
            ) : (
              sortedTemplates.map((tmpl) => (
                <tr key={tmpl.name} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">
                    {TEMPLATE_LABELS[tmpl.name] || tmpl.name}
                    <div className="text-xs text-slate-400 font-mono mt-0.5">{tmpl.name}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 max-w-[200px] truncate">
                    {tmpl.subjectZh || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 max-w-[200px] truncate">
                    {tmpl.subjectEn || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                    {tmpl.updatedAt ? new Date(tmpl.updatedAt).toLocaleString('zh-CN') : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onEdit(tmpl)}
                        className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                      >
                        <Edit3 size={14} />
                        编辑
                      </button>
                      <button
                        onClick={() => onDelete(tmpl)}
                        className="flex items-center gap-1 text-sm text-red-600 hover:text-red-800"
                      >
                        <Trash2 size={14} />
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
