interface PreviewProps {
  markdown: string | null
}

export default function ContentPreview({ markdown }: PreviewProps) {
  if (!markdown || !markdown.trim()) {
    return (
      <div className="text-sm text-slate-400 italic py-4 text-center">
        无内容预览
      </div>
    )
  }

  // Simple markdown-like rendering for preview
  const lines = markdown.split('\n')

  return (
    <div className="prose prose-sm max-w-none text-sm text-slate-700 space-y-2">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) return <h2 key={i} className="text-base font-bold text-slate-900 mt-4">{line.slice(3)}</h2>
        if (line.startsWith('# ')) return <h1 key={i} className="text-lg font-bold text-slate-900 mt-4">{line.slice(2)}</h1>
        if (line.startsWith('- ')) return <li key={i} className="text-slate-600 ml-4 list-disc">{line.slice(2)}</li>
        if (line.startsWith('> ')) return <blockquote key={i} className="border-l-2 border-slate-300 pl-3 text-slate-500 italic">{line.slice(2)}</blockquote>
        if (line.trim() === '') return <div key={i} className="h-2" />
        return <p key={i} className="text-slate-600">{line}</p>
      })}
    </div>
  )
}
