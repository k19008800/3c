import { Zap, Route, DollarSign, Layers, Shield, Key } from 'lucide-react'
import { useI18n } from '@/hooks/useI18n'

const FEATURES = [
  { icon: Layers, titleKey: 'features.items.0.title', descKey: 'features.items.0.desc' },
  { icon: Route, titleKey: 'features.items.1.title', descKey: 'features.items.1.desc' },
  { icon: DollarSign, titleKey: 'features.items.2.title', descKey: 'features.items.2.desc' },
  { icon: Zap, titleKey: 'features.items.3.title', descKey: 'features.items.3.desc' },
  { icon: Shield, titleKey: 'features.items.4.title', descKey: 'features.items.4.desc' },
  { icon: Key, titleKey: 'features.items.5.title', descKey: 'features.items.5.desc' },
]

export default function FeatureGrid() {
  const { t } = useI18n()

  return (
    <section className="py-20 sm:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">
            {t('features.title')}
          </h2>
          <p className="mt-4 text-lg text-slate-500 max-w-2xl mx-auto">
            {t('features.items.0.desc')}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature) => (
            <div
              key={feature.titleKey}
              className="group bg-white rounded-2xl border border-slate-200 p-6 hover:border-blue-200 hover:shadow-lg transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
                <feature.icon size={22} />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">{t(feature.titleKey)}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{t(feature.descKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}