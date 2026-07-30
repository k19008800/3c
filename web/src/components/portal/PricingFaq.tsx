import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useI18n } from '@/hooks/useI18n'

const FAQ_KEYS = [
  { q: 'pricing_faq.q1', a: 'pricing_faq.a1' },
  { q: 'pricing_faq.q2', a: 'pricing_faq.a2' },
  { q: 'pricing_faq.q3', a: 'pricing_faq.a3' },
  { q: 'pricing_faq.q4', a: 'pricing_faq.a4' },
  { q: 'pricing_faq.q5', a: 'pricing_faq.a5' },
  { q: 'pricing_faq.q6', a: 'pricing_faq.a6' },
]

export default function PricingFaq() {
  const { t } = useI18n()
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <div className="space-y-3">
      {FAQ_KEYS.map((faq, i) => (
        <div
          key={i}
          className="bg-white rounded-xl border border-slate-200 overflow-hidden"
        >
          <button
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-50 transition-colors"
          >
            <span className="text-sm font-medium text-slate-900">{t(faq.q)}</span>
            <ChevronDown
              size={18}
              className={`text-slate-400 transition-transform shrink-0 ml-4 ${
                openIndex === i ? 'rotate-180' : ''
              }`}
            />
          </button>
          {openIndex === i && (
            <div className="px-6 pb-4">
              <p className="text-sm text-slate-500 leading-relaxed">{t(faq.a)}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}