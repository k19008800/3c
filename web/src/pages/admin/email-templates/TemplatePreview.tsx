interface TemplatePreviewProps {
  html: string
  label: string
}

export default function TemplatePreview({ html, label }: TemplatePreviewProps) {
  if (!html) {
    return (
      <div className="flex items-center justify-center min-h-[120px] border border-dashed border-slate-300 rounded-lg bg-slate-50 text-sm text-slate-400">
        {label === 'zh' ? '暂无内容' : 'No content'}
      </div>
    )
  }

  return (
    <div
      className="w-full min-h-[180px] px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm prose prose-sm max-w-none overflow-auto"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
