/**
 * QuickConnectPanel — 一键接入面板
 *
 * 展示在用户仪表盘顶部，引导用户完成接入的 3 个步骤：
 * 1. 复制转发地址
 * 2. 选择语言 → 复制 SDK 示例（含自动填充 API Key）
 * 3. 快速调试链接
 *
 * 新用户/未关闭过的用户显示，24 小时内不再显示已关闭的。
 * 关闭状态持久化到 localStorage。
 */

import { useState, useEffect, useCallback } from 'react'
import { get, post } from '@/lib/api'
import CodeBlock from '@/components/portal/CodeBlock'
import type { ApiKey } from '@/types'
import { Copy, CheckCircle2, Terminal, X, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'

type SnippetLang = 'curl' | 'python' | 'javascript' | 'go'

const LANG_OPTIONS: { key: SnippetLang; label: string }[] = [
  { key: 'curl', label: 'cURL' },
  { key: 'python', label: 'Python' },
  { key: 'javascript', label: 'JavaScript' },
  { key: 'go', label: 'Go' },
]

function generateSnippets(baseUrl: string, apiKey: string, model: string): Record<SnippetLang, string> {
  const safeKey = apiKey ?? ''
  const maskedKey = safeKey.length > 12
    ? `${safeKey.slice(0, 7)}...${safeKey.slice(-4)}`
    : safeKey

  return {
    curl: `curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${model}","messages":[{"role":"user","content":"你好"}]}'`,

    python: `import requests

response = requests.post(
    "${baseUrl}/v1/chat/completions",
    headers={
        "Authorization": "Bearer ${apiKey}",
        "Content-Type": "application/json"
    },
    json={
        "model": "${model}",
        "messages": [{"role": "user", "content": "你好"}]
    }
)
print(response.json())`,

    javascript: `const response = await fetch("${baseUrl}/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${apiKey}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "${model}",
    messages: [{ role: "user", content: "你好" }]
  })
})
const data = await response.json()
console.log(data)`,

    go: `package main

import (
  "bytes"
  "encoding/json"
  "fmt"
  "net/http"
)

func main() {
  body := map[string]any{
    "model": "${model}",
    "messages": []any{map[string]string{"role": "user", "content": "你好"}},
  }
  b, _ := json.Marshal(body)
  req, _ := http.NewRequest("POST", "${baseUrl}/v1/chat/completions",
    bytes.NewReader(b))
  req.Header.Set("Authorization", "Bearer ${apiKey}")
  req.Header.Set("Content-Type", "application/json")

  resp, _ := http.DefaultClient.Do(req)
  defer resp.Body.Close()

  var result map[string]any
  json.NewDecoder(resp.Body).Decode(&result)
  fmt.Printf("%+v\\n", result)
}`,
  }
}

/* ────────────────────────────────────── */

interface QuickConnectPanelProps {
  apiKeys: ApiKey[]
  baseUrl: string
  defaultModel: string
}

export default function QuickConnectPanel({ apiKeys, baseUrl, defaultModel }: QuickConnectPanelProps) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('quickconnect_dismissed_at')
        ? Date.now() - Number(localStorage.getItem('quickconnect_dismissed_at')) < 86400000
        : false
    } catch { return false }
  })

  const [selectedKey, setSelectedKey] = useState<ApiKey | null>(
    apiKeys.find(k => k.status) ?? apiKeys[0] ?? null
  )
  const [lang, setLang] = useState<SnippetLang>('curl')
  const [model, setModel] = useState(defaultModel)
  const [snippets, setSnippets] = useState<Record<SnippetLang, string>>(() =>
    generateSnippets(baseUrl, selectedKey?.key ?? 'sk-***', defaultModel)
  )
  const [copiedUrl, setCopiedUrl] = useState(false)

  useEffect(() => {
    if (selectedKey && selectedKey.key) {
      setSnippets(generateSnippets(baseUrl, selectedKey.key, model))
    }
  }, [selectedKey, model, baseUrl])

  const handleCopyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${baseUrl}/v1/chat/completions`)
      setCopiedUrl(true)
      setTimeout(() => setCopiedUrl(false), 2000)
    } catch {}
  }, [baseUrl])

  const handleDismiss = () => {
    setDismissed(true)
    try { localStorage.setItem('quickconnect_dismissed_at', String(Date.now())) } catch {}
  }

  if (dismissed) return null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <Terminal size={16} className="text-blue-500" />
          快速接入 — 三步完成
        </h3>
        <button onClick={handleDismiss} className="text-slate-400 hover:text-slate-600" title="关闭（24小时内不再显示）">
          <X size={16} />
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Step 1: 复制转发地址 */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">1</span>
            <span className="text-sm font-medium text-slate-700">复制转发地址</span>
          </div>
          <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
            <code className="flex-1 text-sm text-slate-700 font-mono select-all">
              {baseUrl}/v1/chat/completions
            </code>
            <button
              onClick={handleCopyUrl}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-white border rounded-md hover:bg-slate-50 transition"
            >
              {copiedUrl ? <CheckCircle2 size={14} className="text-green-500" /> : <Copy size={14} />}
              {copiedUrl ? '已复制' : '复制'}
            </button>
          </div>
        </div>

        {/* Step 2: 选择 API Key + 语言 + 复制示例 */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">2</span>
            <span className="text-sm font-medium text-slate-700">选择密钥 & 语言</span>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            {apiKeys.filter(k => k.status).slice(0, 5).map(k => (
              <button
                key={k.id}
                onClick={() => setSelectedKey(k)}
                className={`px-2.5 py-1 text-xs rounded-md border transition ${
                  selectedKey?.id === k.id
                    ? 'border-blue-400 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                {k.name}
              </button>
            ))}
            <div className="flex gap-1 ml-auto">
              {LANG_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setLang(opt.key)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition ${
                    lang === opt.key
                      ? 'border-slate-400 bg-slate-100 text-slate-800 font-medium'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <CodeBlock
            code={snippets[lang]}
            language={LANG_OPTIONS.find(l => l.key === lang)?.label}
            label={`模型: ${model}`}
          />
        </div>

        {/* Step 3: 快速调试 */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">3</span>
            <span className="text-sm font-medium text-slate-700">在线调试</span>
          </div>
          <button
            onClick={async () => {
              try {
                const res = await post('/api/v1/user/debug-token', { minutes: 60 })
                window.open(res.data.playgroundUrl, '_blank')
              } catch {}
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Terminal size={15} />
            打开在线调试
          </button>
        </div>
      </div>
    </div>
  )
}
