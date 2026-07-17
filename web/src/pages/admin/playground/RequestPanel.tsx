// ============================================================
//  RequestPanel — 请求输入区（System Prompt + 用户消息 + 发送）
// ============================================================

import { useCallback } from 'react'
import { Send, Loader2 } from 'lucide-react'
import type { ChatMessage } from './types'
import EndpointSelector from './EndpointSelector'

interface RequestPanelProps {
  models: { id: number; name: string; displayName?: string; provider?: string; status: boolean }[]
  selectedModel: string
  loadingModels: boolean
  messages: ChatMessage[]
  sending: boolean
  onModelChange: (model: string) => void
  onMessageChange: (role: ChatMessage['role'], content: string) => void
  onSend: () => void
}

export default function RequestPanel({
  models,
  selectedModel,
  loadingModels,
  messages,
  sending,
  onModelChange,
  onMessageChange,
  onSend,
}: RequestPanelProps) {
  const userContent = messages.find((m) => m.role === 'user')?.content || ''
  const systemContent = messages.find((m) => m.role === 'system')?.content || ''
  const canSend = Boolean(selectedModel && userContent.trim() && !sending)

  const handleSend = useCallback(() => {
    if (canSend) onSend()
  }, [canSend, onSend])

  return (
    <div className="space-y-4">
      <EndpointSelector
        models={models}
        selectedModel={selectedModel}
        loading={loadingModels}
        onChange={onModelChange}
      />

      {/* System Prompt */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <label className="text-xs font-medium text-slate-500 mb-2 block">System Prompt (可选)</label>
        <textarea
          value={systemContent}
          onChange={(e) => onMessageChange('system', e.target.value)}
          placeholder="设置系统角色..."
          rows={3}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
        />
      </div>

      {/* User Message + Send */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <label className="text-xs font-medium text-slate-500 mb-2 block">用户消息</label>
        <textarea
          value={userContent}
          onChange={(e) => onMessageChange('user', e.target.value)}
          placeholder="输入测试消息..."
          rows={5}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {sending ? (
            <><Loader2 size={16} className="animate-spin" /> 发送中...</>
          ) : (
            <><Send size={15} /> 发送调试请求</>
          )}
        </button>
      </div>
    </div>
  )
}
