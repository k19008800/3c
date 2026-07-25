import { useState, useCallback } from 'react'
import { Search, AlertTriangle, CheckCircle, X, Loader2 } from 'lucide-react'
import { post } from '@/lib/api'
import type { CATEGORIES } from './types'

interface MatchResult {
  word: string
  position: number
  category: string
  severity: string
}

interface TestResult {
  matched: boolean
  matches: MatchResult[]
  totalMatches: number
  uniqueWords: number
}

interface Props {
  categories: typeof CATEGORIES
  onClose?: () => void
}

export default function SensitiveWordTest({ categories, onClose }: Props) {
  const [text, setText] = useState('')
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleTest = useCallback(async () => {
    if (!text.trim()) {
      setError('请输入测试文本')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await post<TestResult>('/api/v1/admin/sensitive-words/test', {
        text: text.trim(),
        category: category || undefined,
      })
      setResult(res)
    } catch (err: any) {
      setError(err.message || '测试失败')
    } finally {
      setLoading(false)
    }
  }, [text, category])

  // 高亮显示匹配文本
  const renderHighlightedText = useCallback(() => {
    if (!result || !result.matched) {
      return <span className="whitespace-pre-wrap">{text}</span>
    }

    const sortedMatches = [...result.matches].sort((a, b) => a.position - b.position)
    const elements: React.ReactNode[] = []
    let lastPos = 0

    sortedMatches.forEach((match, idx) => {
      // 添加匹配前的普通文本
      if (match.position > lastPos) {
        elements.push(
          <span key={`text-${idx}`} className="whitespace-pre-wrap">
            {text.slice(lastPos, match.position)}
          </span>
        )
      }

      // 添加高亮的匹配词
      const severityColors: Record<string, string> = {
        low: 'bg-yellow-100 text-yellow-800',
        medium: 'bg-orange-100 text-orange-800',
        high: 'bg-red-100 text-red-800',
        critical: 'bg-red-200 text-red-900 font-semibold',
      }

      elements.push(
        <mark
          key={`match-${idx}`}
          className={`px-0.5 rounded ${severityColors[match.severity] || 'bg-yellow-100 text-yellow-800'}`}
          title={`${match.word} (${match.category}, ${match.severity})`}
        >
          {text.slice(match.position, match.position + match.word.length)}
        </mark>
      )

      lastPos = match.position + match.word.length
    })

    // 添加最后的普通文本
    if (lastPos < text.length) {
      elements.push(
        <span key="text-end" className="whitespace-pre-wrap">
          {text.slice(lastPos)}
        </span>
      )
    }

    return elements
  }, [text, result])

  const severityLabels: Record<string, string> = {
    low: '低',
    medium: '中',
    high: '高',
    critical: '严重',
  }

  const categoryLabels: Record<string, string> = {
    general: '通用',
    political: '政治',
    porn: '色情',
    fraud: '欺诈',
    violence: '暴力',
    custom: '自定义',
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Search size={20} />
          敏感词测试
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Input */}
      <div className="space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="输入要测试的文本内容..."
          className="w-full px-3 py-2 border rounded-lg h-40 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />

        <div className="flex items-center gap-3">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-1.5 border rounded text-sm"
            disabled={loading}
          >
            <option value="">全部分类</option>
            {categories.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>

          <button
            onClick={handleTest}
            disabled={loading || !text.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                测试中...
              </>
            ) : (
              <>
                <Search size={16} />
                开始测试
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4">
          {/* Summary */}
          <div
            className={`flex items-center gap-3 p-4 rounded-lg ${
              result.matched
                ? 'bg-red-50 border border-red-200'
                : 'bg-green-50 border border-green-200'
            }`}
          >
            {result.matched ? (
              <>
                <AlertTriangle className="text-red-600" size={24} />
                <div>
                  <div className="font-semibold text-red-800">
                    检测到敏感词
                  </div>
                  <div className="text-sm text-red-600">
                    共 {result.totalMatches} 处匹配，涉及 {result.uniqueWords} 个不同词汇
                  </div>
                </div>
              </>
            ) : (
              <>
                <CheckCircle className="text-green-600" size={24} />
                <div>
                  <div className="font-semibold text-green-800">
                    未检测到敏感词
                  </div>
                  <div className="text-sm text-green-600">
                    文本内容安全
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Highlighted Text */}
          {result.matched && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-slate-700">
                匹配结果（高亮显示）：
              </div>
              <div className="p-4 bg-slate-50 border rounded-lg text-sm leading-relaxed">
                {renderHighlightedText()}
              </div>
            </div>
          )}

          {/* Match List */}
          {result.matched && result.matches.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-slate-700">
                匹配详情：
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="px-3 py-2 text-left font-medium">敏感词</th>
                      <th className="px-3 py-2 text-left font-medium">位置</th>
                      <th className="px-3 py-2 text-left font-medium">分类</th>
                      <th className="px-3 py-2 text-left font-medium">严重度</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.matches.map((match, idx) => (
                      <tr key={idx} className="border-b hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono">{match.word}</td>
                        <td className="px-3 py-2 text-slate-600">{match.position}</td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-xs">
                            {categoryLabels[match.category] || match.category}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`px-2 py-0.5 rounded text-xs ${
                              match.severity === 'critical'
                                ? 'bg-red-100 text-red-700'
                                : match.severity === 'high'
                                ? 'bg-orange-100 text-orange-700'
                                : match.severity === 'medium'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {severityLabels[match.severity] || match.severity}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
