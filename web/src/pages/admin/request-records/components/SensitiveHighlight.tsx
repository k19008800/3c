/**
 * SensitiveHighlight — 敏感内容高亮
 *
 * 在文本中高亮匹配的敏感词，红色背景 + 红色文字。
 */

interface SensitiveHighlightProps {
  /** 原始文本 */
  text: string
  /** 敏感词列表 */
  words: string[]
  /** 可选：最大长度，超出截断 */
  maxLength?: number
}

export default function SensitiveHighlight({ text, words, maxLength }: SensitiveHighlightProps) {
  if (!text) return <span className="text-slate-400">-</span>

  const displayText = maxLength && text.length > maxLength ? text.slice(0, maxLength) + '...' : text

  if (!words || words.length === 0) {
    return <span className="text-slate-700 whitespace-pre-wrap break-all">{displayText}</span>
  }

  // 构建正则：将敏感词转义后合并
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi')

  const parts = displayText.split(pattern)

  return (
    <span className="whitespace-pre-wrap break-all">
      {parts.map((part, i) => {
        const isSensitive = words.some(
          (w) => w.toLowerCase() === part.toLowerCase()
        )
        return isSensitive ? (
          <span key={i} className="bg-red-100 text-red-600 rounded px-0.5 font-medium">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      })}
    </span>
  )
}