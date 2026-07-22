import { memo } from 'react'

interface EmptyStateProps {
  icon?: string
  title?: string
  description?: string
  action?: { label: string; onClick: () => void }
}

function EmptyStateInner({
  icon = '📭',
  title = '暂无数据',
  description,
  action,
}: EmptyStateProps) {
  return (
    <tr>
      <td colSpan={99} className="text-center py-12">
        <div className="flex flex-col items-center gap-2">
          <span className="text-3xl">{icon}</span>
          <p className="text-sm text-slate-400 font-medium">{title}</p>
          {description && (
            <p className="text-xs text-slate-300 max-w-[300px]">{description}</p>
          )}
          {action && (
            <button
              onClick={action.onClick}
              className="mt-2 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              {action.label}
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

export default memo(EmptyStateInner)
