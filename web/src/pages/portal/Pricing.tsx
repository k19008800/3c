import PricingTable from '@/components/portal/PricingTable'
import PricingFaq from '@/components/portal/PricingFaq'
import { useI18n } from '@/hooks/useI18n'

export default function PortalPricing() {
  const { t, isZh } = useI18n()
  return (
    <div className="py-16 sm:py-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">{t('pricing_page.title')}</h1>
          <p className="mt-4 text-lg text-slate-500 max-w-2xl mx-auto">
            {t('pricing_page.subtitle')}
          </p>
        </div>

        <PricingTable />

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-5">
          <p className="text-sm text-blue-700">
            <span dangerouslySetInnerHTML={{ __html: t('pricing_page.billing_note') }} />
          </p>
        </div>

        <div className="mt-16">
          <h2 className="text-2xl font-bold text-slate-900 mb-8 text-center">{t('footer.faq')}</h2>
          <div className="max-w-2xl mx-auto">
            <PricingFaq />
          </div>
        </div>
      </div>
    </div>
  )
}