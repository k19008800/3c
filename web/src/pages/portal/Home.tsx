import SEOHead from '@/components/SEOHead'
import HeroSection from '@/components/portal/HeroSection'
import FeatureGrid from '@/components/portal/FeatureGrid'
import HowItWorks from '@/components/portal/HowItWorks'
import StatsBanner from '@/components/portal/StatsBanner'
import CTASection from '@/components/portal/CTASection'

export default function PortalHome() {
  return (
    <>
      <SEOHead />
      <HeroSection />
      <FeatureGrid />
      <HowItWorks />
      <StatsBanner />
      <CTASection />
    </>
  )
}
