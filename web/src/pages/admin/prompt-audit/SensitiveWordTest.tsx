import { useState } from 'react'
import { post } from '@/lib/api'
import {
  Loader2, Search, AlertTriangle, CheckCircle2, Copy, Trash2,
} from 'lucide-react'

interface MatchResult {
  word: string
  position: number
  category: string
  severity: string
}

interface TestResponse {
  matched: boolean
  matches: MatchResult[]
  totalMatches: number
  uniqueWords: number
}

// 严重级别颜色
const severityColors: Record<string, string> = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-yellow-100 text-yellow-700 border-yellow-200',
}

export default function SensitiveWordTest() {
  const [text, setText] = useState('')
  const [category, setCategory] = useState('')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<TestResponse | null>(null)
  const [error, setError] = useState('')

  const handleTest = async () => {
    if (!text.trim()) {
      setError('请输入测试文本')
      return
    }
    setTesting(true)
    setError('')
    setResult(null)
    try {
      const res = await post<TestResponse>('/api/v1/admin/sensitive-words/test', {
        text: text,
        category: category || undefined,
      })
      if (res) setResult(res)
    } catch (err: any) {
      setError(err.message || '检测失败')
    }
    setTesting(false)
  }

  const handleClear = () => {
    setText('')
    setResult(null)
    setError('')
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="space-y-4">
      {/* 标题区 */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Search size={18} className="text-blue-600" />
          敏感词测试工具
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          输入待检测文本，系统将自动匹配已启用的敏感词库
        </p>
      </div>

      {/* 输入区 */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-600"
          >
            <option value="">全部分类</option>
            <option value="general">通用</option>
            <option value="politics">政治</option>
            <option value="pornography">色情</option>
            <option value="violence">暴力</option>
            <option value="advertising">广告</option>
            <option value="custom">自定义</option>
          </select>
          <span className="text-xs text-slate-400">可选：按分类过滤检测</span>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="在此输入需要检测敏感词的文本..."
          className="w-full h-40 px-4 py-3 border border-slate-200 rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className="flex items-center gap-2">
          <button
            onClick={handleTest}
            disabled={testing || !text.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition"
          >
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            检测敏感词
          </button>
          <button
            onClick={handleCopy}
            disabled={!text}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 text-sm disabled:opacity-50 transition"
          >
            <Copy size={14} />
            复制
          </button>
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 text-sm transition"
          >
            <Trash2 size={14} />
            清空
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-600 text-sm">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* 检测结果 */}
      {result && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          {/* 概览 */}
          <div className="flex items-center gap-3">
            {result.matched ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-100 text-red-700 text-sm font-medium">
                <AlertTriangle size={14} />
                检测到 {result.totalMatches} 处匹配（{result.uniqueWords} 个敏感词）
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-100 text-green-700 text-sm font-medium">
                <CheckCircle2 size={14} />
                未检测到敏感词
              </div>
            )}
            <span className="text-xs text-slate-400">
              文本长度：{text.length} 字符
            </span>
          </div>

          {/* 匹配详情 */}
          {result.matches.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-500">匹配详情</p>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {result.matches.map((m, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${severityColors[m.severity] || severityColors.medium}`}
                  >
                    <span className="font-mono font-medium">{m.word}</span>
                    <span className="text-xs opacity-70">位置 {m.position}</span>
                    <span className="text-xs opacity-70">{m.category}</span>
                    <span className="text-xs opacity-70 ml-auto">{m.severity}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 高亮原文 */}
          {result.matches.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">原文高亮</p>
              <div className="p-3 bg-slate-50 rounded-lg text-sm leading-relaxed whitespace-pre-wrap break-all">
                {highlightText(text, result.matches)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// 高亮敏感词
function highlightText(text: string, matches: MatchResult[]): JSX.Element[] {
  if (matches.length === 0) return [<span key="0">{text}</span>]

  // 按位置升序排列，构建片段
  const sorted = [...matches].sort((a, b) => a.position - b.position)
  const segments: JSX.Element[] = []
  let cursor = 0

  for (let i = 0; i < sorted.length; i++) {
    const match = sorted[i]
    if (match.position > cursor) {
      segments.push(
        <span key={`txt-${i}`}>{text.slice(cursor, match.position)}</span>
      )
    }
    segments.push(
      <mark key={`hl-${i}`} className="bg-red-200 text-red-800 px-0.5 rounded">{text.slice(match.position, match.position + match.word.length)}</mark>
    )
    cursor = match.position + match.word.length
  }

  if (cursor < text.length) {
    segments.push(
      <span key="txt-end">{text.slice(cursor)}</span>
    )
  }

  return segments
}
