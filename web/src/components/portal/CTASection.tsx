import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useI18n } from '@/hooks/useI18n'

function CTASection() {
  const { t } = useI18n()

  return (
    <section className="py-20 sm:py-28 bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">
          {t('cta.title')}
        </h2>
        <p className="mt-4 text-lg text-slate-500 max-w-xl mx-auto">
          {t('cta.subtitle')}
        </p>
        <div className="mt-8">
          <Link
            to="/register"
            className="inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-lg shadow-blue-600/25"
          >
            {t('cta.button')}
            <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </section>
  )
}

export default React.memo(CTASection)