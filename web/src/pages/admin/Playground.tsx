// ============================================================
//  3cloud (3C) — 在线调试面板 (Playground)
//  管理员测试模型转发连通性，展示 _chain 链路追踪
//  调试模式不计费
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { get, post } from '@/lib/api'
import { Bug } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'
import type { ModelItem, PlaygroundResponse, ChatMessage } from './playground/types'
import RequestPanel from './playground/RequestPanel'
import ResponsePanel from './playground/ResponsePanel'
import UsageStats from './playground/UsageStats'

export default function Playground() {
  const [models, setModels] = useState<ModelItem[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [loadingModels, setLoadingModels] = useState(true)
  const [userContent, setUserContent] = useState('')
  const [systemContent, setSystemContent] = useState('')
  const [sending, setSending] = useState(false)
  const [response, setResponse] = useState<PlaygroundResponse | null>(null)
  const [error, setError] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  // ── 加载模型列表 ──
  useEffect(() => {
    get<any>('/api/v1/models')
      .then((data: any) => {
        const items = data?.list || data || []
        const list = (Array.isArray(items) ? items : [])
          .filter((m: any) => m.status !== false)
        setModels(list)
        if (list.length > 0) {
          setSelectedModel(list[0].name)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingModels(false))
  }, [])

  // ── 自动滚动 ──
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [response])

  const handleMessageChange = useCallback((role: ChatMessage['role'], content: string) => {
    if (role === 'user') setUserContent(content)
    if (role === 'system') setSystemContent(content)
  }, [])

  // ── 发送调试请求 ──
  const handleSend = useCallback(async () => {
    if (!selectedModel || !userContent.trim()) return

    setSending(true)
    setError('')
    setResponse(null)

    try {
      const body: Record<string, unknown> = {
        model: selectedModel,
        messages: [{ role: 'user', content: userContent.trim() }],
      }
      if (systemContent.trim()) {
        body.messages = [
          { role: 'system', content: systemContent.trim() },
          ...(body.messages as any[]),
        ]
      }

      const res = await post<any>('/api/v1/playground/chat/completions', body)

      setResponse((res as PlaygroundResponse)._chain
        ? (res as PlaygroundResponse)
        : {
            _chain: [{ step: 0, name: '响应', status: 'ok', detail: '请求完成' }],
            _testMode: true,
            _warning: '调试模式',
            ...res,
          })
    } catch (err: any) {
      setError(err.message || '请求失败: ' + (err.response?.data?.message || err.code || ''))
    } finally {
      setSending(false)
    }
  }, [selectedModel, userContent, systemContent])

  const msgs: ChatMessage[] = []
  if (systemContent) msgs.push({ role: 'system', content: systemContent })
  if (userContent) msgs.push({ role: 'user', content: userContent })

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bug size={22} className="text-blue-500" />
          <h1 className="text-xl font-bold text-slate-800">在线调试</h1>
          <FeatureDescription page="admin/playground" className="ml-2" />
          <span className="px-2 py-0.5 text-[10px] bg-amber-100 text-amber-700 rounded-full font-medium">
            不计费 · 链路追踪
          </span>
        </div>
      </div>

      {/* Request & Response Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-2">
          <RequestPanel
            models={models}
            selectedModel={selectedModel}
            loadingModels={loadingModels}
            messages={msgs}
            sending={sending}
            onModelChange={setSelectedModel}
            onMessageChange={handleMessageChange}
            onSend={handleSend}
          />
        </div>

        <div className="lg:col-span-3 space-y-4">
          <ResponsePanel response={response} error={error} />
          {response?.usage && <UsageStats response={response} />}
          <div ref={chatEndRef} />
        </div>
      </div>
    </div>
  )
}
