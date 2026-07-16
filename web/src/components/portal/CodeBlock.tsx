import { useState, useCallback } from 'react'
import { Copy, CheckCircle2 } from 'lucide-react'

interface CodeBlockProps {
  code: string
  language?: string
  /** 是否替换 API Key 为遮挡模式 */
  maskApiKey?: boolean
  /** 额外展示的标签 */
  label?: string
}

export default function CodeBlock({ code, language, maskApiKey, label }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const displayCode = maskApiKey
    ? code.replace(/Bearer\s+sk-[a-zA-Z0-9]{8,}/g, 'Bearer sk-****...****')
    : code

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
      const ta = document.createElement('textarea')
      ta.value = code
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [code])

  return (
    <div className="bg-slate-900 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-2">
          {language && (
            <span className="text-xs font-medium text-slate-400">{language}</span>
          )}
          {label && (
            <span className="text-xs text-blue-400 bg-blue-900/30 px-1.5 py-0.5 rounded">{label}</span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition"
        >
          {copied ? (
            <>
              <CheckCircle2 size={14} className="text-green-400" />
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
      <pre className="p-4 overflow-x-auto">
        <code className="text-sm text-green-400 font-mono leading-relaxed whitespace-pre">
          {displayCode}
        </code>
      </pre>
    </div>
  )
}
