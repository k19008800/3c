interface AgreementSectionProps {
  agreed: boolean
  onChange: (agreed: boolean) => void
}

export default function AgreementSection({ agreed, onChange }: AgreementSectionProps) {
  return (
    <label className="flex items-start gap-2 cursor-pointer group">
      <input
        type="checkbox"
        checked={agreed}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
      />
      <span className="text-sm text-slate-500 group-hover:text-slate-700 transition">
        我已阅读并同意{' '}
        <a
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-700 hover:underline font-medium"
          onClick={(e) => e.stopPropagation()}
        >
          《服务条款》
        </a>
        {' '}和{' '}
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-700 hover:underline font-medium"
          onClick={(e) => e.stopPropagation()}
        >
          《隐私政策》
        </a>
      </span>
    </label>
  )
}
