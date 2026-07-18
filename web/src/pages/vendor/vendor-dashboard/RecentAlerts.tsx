import { AlertCircle, X } from 'lucide-react'

interface Props {
  message: string
  onDismiss: () => void
}

/**
 * RecentAlerts — 最近告警
 * 展示错误/警告信息条，支持一键关闭
 */
export default function RecentAlerts({ message, onDismiss }: Props) {
  if (!message) return null

  return (
    <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm border border-red-200">
      <AlertCircle size={16} />
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="text-red-500 hover:text-red-700">
        <X size={16} />
      </button>
    </div>
  )
}
