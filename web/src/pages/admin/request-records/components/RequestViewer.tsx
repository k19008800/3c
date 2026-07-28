/**
 * RequestViewer — 请求/响应体展示
 *
 * JSON 格式化 + 语法高亮，可折叠的大对象，复制按钮。
 */

import { useState, useMemo, useCallback } from 'react'
import { Copy, Check, ChevronDown, ChevronRight } from 'lucide-react'

interface RequestViewerProps {
  data: any
  title: string
  maxHeight?: number
}

/** 语法高亮：将 JSON 字符串着色 */
function highlightJson(json: string): string {
  // 先转义 HTML
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // 着色规则
  return escaped.replace(
    /("(?:[^"\\]|\\.)*")\s*:/g, // key
    '<span class="json-key">$1</span>:'
  ).replace(
    /:(\s*)("(?:[^"\\]|\\.)*")/g, // string value
    ':$1<span class="json-string">$2</span>'
  ).replace(
    /:\s*(true|false)\b/g, // boolean
    ': <span class="json-bool">$1</span>'
  ).replace(
    /:\s*null\b/g, // null
    ': <span class="json-null">null</span>'
  ).replace(
    /:\s*(\d+\.?\d*)/g, // number
    ': <span class="json-number">$1</span>'
  )
}

export default function RequestViewer({ data, title, maxHeight = 400 }: RequestViewerProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [copied, setCopied] = useState(false)

  const formatted = useMemo(() => {
    try {
      return JSON.stringify(data, null, 2)
    } catch {
      return String(data)
    }
  }, [data])

  const lineCount = useMemo(() => formatted.split('\n').length, [formatted])

  const isLarge = lineCount > 50

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatted)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
      const ta = document.createElement('textarea')
      ta.value = formatted
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [formatted])

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          {isLarge && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="text-slate-400 hover:text-slate-600 transition"
              title={collapsed ? '展开' : '折叠'}
            >
              {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
          <span className="text-sm font-medium text-slate-700">{title}</span>
          {isLarge && (
            <span className="text-xs text-slate-400">
              {lineCount} 行
            </span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded transition"
        >
          {copied ? (
            <>
              <Check size={14} className="text-green-500" />
              已复制
            </>
          ) : (
            <>
              <Copy size={14} />
              复制
            </>
          )}
        </button>
      </div>

      {/* Body */}
      {!collapsed && (
        <div
          className="overflow-auto p-4"
          style={{ maxHeight }}
        >
          <pre
            className="text-xs font-mono leading-relaxed whitespace-pre-wrap break-all"
            dangerouslySetInnerHTML={{ __html: highlightJson(formatted) }}
          />
        </div>
      )}

      {/* 折叠时展示预览 */}
      {collapsed && (
        <div className="px-4 py-3 text-xs text-slate-400 italic">
          (已折叠，点击展开查看 {lineCount} 行内容)
        </div>
      )}

      {/* JSON 语法高亮样式 */}
      <style>{`
        .json-key { color: #0550ae; }
        .json-string { color: #0a3069; }
        .json-number { color: #0550ae; }
        .json-bool { color: #cf222e; }
        .json-null { color: #8b949e; }
      `}</style>
    </div>
  )
}