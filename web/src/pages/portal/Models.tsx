import SEOHead from '@/components/SEOHead'
import ModelCatalog from '@/components/portal/ModelCatalog'
import { useI18n } from '@/hooks/useI18n'

export default function PortalModels() {
  const { t } = useI18n()
  return (
    <>
      <SEOHead />
      <div className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">{t('models_page.title')}</h1>
            <p className="mt-4 text-lg text-slate-500 max-w-2xl mx-auto">
              {t('models_page.description')}
            </p>
          </div>
          <ModelCatalog />
        </div>
      </div>
    </>
  )
}