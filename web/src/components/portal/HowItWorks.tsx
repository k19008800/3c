import { UserPlus, Key, Play } from 'lucide-react'
import { useI18n } from '@/hooks/useI18n'

const STEPS = [
  { icon: UserPlus, step: '01', titleKey: 'how_it_works.step1', descKey: 'how_it_works.step1_desc' },
  { icon: Key, step: '02', titleKey: 'how_it_works.step2', descKey: 'how_it_works.step2_desc' },
  { icon: Play, step: '03', titleKey: 'how_it_works.step3', descKey: 'how_it_works.step3_desc' },
]

export default function HowItWorks() {
  const { t } = useI18n()

  return (
    <section className="py-20 sm:py-28 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">
            {t('how_it_works.title')}
          </h2>
          <p className="mt-4 text-lg text-slate-500 max-w-2xl mx-auto">
            {t('how_it_works.step1_desc')}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {STEPS.map((step, index) => (
            <div key={step.step} className="relative text-center">
              {index < STEPS.length - 1 && (
                <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-px border-t-2 border-dashed border-slate-300" />
              )}
              <div className="relative z-10 mx-auto w-24 h-24 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mb-6">
                <step.icon size={36} className="text-blue-600" />
              </div>
              <div className="inline-block px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold mb-2">
                {step.step}
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">{t(step.titleKey)}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{t(step.descKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}