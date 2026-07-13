interface CodeBlockProps {
  code: string
  language?: string
}

export default function CodeBlock({ code, language }: CodeBlockProps) {
  return (
    <div className="bg-slate-900 rounded-xl overflow-hidden">
      {language && (
        <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
          <span className="text-xs font-medium text-slate-400">{language}</span>
        </div>
      )}
      <pre className="p-4 overflow-x-auto">
        <code className="text-sm text-green-400 font-mono leading-relaxed whitespace-pre">
          {code}
        </code>
      </pre>
    </div>
  )
}
