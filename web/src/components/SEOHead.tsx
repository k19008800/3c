import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useI18n } from '@/hooks/useI18n'

const SITE_NAME = '3Cloud'
const DEFAULT_DESC = 'All-in-One AI Token Platform — Aggregate multiple AI providers with unified API access, smart routing, and transparent billing.'
const DEFAULT_KEYWORDS = 'AI, Token, API, LLM, DeepSeek, OpenAI, Anthropic, AI Platform'
const SITE_URL = 'https://unmisa.com'

interface SEOProps {
  title?: string
  description?: string
  keywords?: string
  image?: string
  type?: 'website' | 'article'
  publishedTime?: string
  noIndex?: boolean
}

const pageMeta: Record<string, { title: string; description: string }> = {
  '/': { title: '3Cloud — AI Token Platform', description: 'One API to access 130+ AI models. Unified token billing, smart routing, and real-time monitoring.' },
  '/models': { title: 'AI Models — 3Cloud', description: 'Browse all AI models supported by 3Cloud. Compare pricing across vendors, filter by type.' },
  '/pricing': { title: 'Pricing — 3Cloud', description: 'Transparent AI token pricing. Pay per actual token consumption, no hidden fees.' },
  '/status': { title: 'Service Status — 3Cloud', description: 'Real-time system status for 3Cloud services. Check vendor availability and incident history.' },
  '/docs': { title: 'Documentation — 3Cloud', description: 'Developer documentation for 3Cloud API. Quick start guides, SDK references, and code examples.' },
  '/register': { title: 'Register — 3Cloud', description: 'Create your 3Cloud account. Free registration, no credit card required.' },
  '/login': { title: 'Login — 3Cloud', description: 'Sign in to your 3Cloud account to manage API keys, view usage, and configure settings.' },
}

export default function SEOHead({ title, description, keywords, image, type = 'website', publishedTime, noIndex }: SEOProps) {
  const location = useLocation()
  const { t } = useI18n()

  const pageKey = `/${location.pathname.split('/').filter(Boolean)[0] || ''}`
  const pageMetaEntry = pageMeta[pageKey] || pageMeta['/']

  const finalTitle = title || pageMetaEntry?.title || `${SITE_NAME} — AI Token Platform`
  const finalDesc = description || pageMetaEntry?.description || DEFAULT_DESC

  useEffect(() => {
    // Update document head
    document.title = finalTitle

    const setMeta = (name: string, content: string, property = false) => {
      const attr = property ? 'property' : 'name'
      let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute(attr, name)
        document.head.appendChild(el)
      }
      el.setAttribute('content', content)
    }

    const removeMeta = (name: string, property = false) => {
      const attr = property ? 'property' : 'name'
      const el = document.querySelector(`meta[${attr}="${name}"]`)
      if (el) el.remove()
    }

    // Basic meta
    setMeta('description', finalDesc)
    if (keywords) setMeta('keywords', keywords)

    // OG tags
    setMeta('og:title', finalTitle, true)
    setMeta('og:description', finalDesc, true)
    setMeta('og:type', type, true)
    setMeta('og:url', `${SITE_URL}${location.pathname}`, true)
    setMeta('og:site_name', SITE_NAME, true)
    if (image) setMeta('og:image', image, true)

    // Twitter card
    setMeta('twitter:card', 'summary_large_image')
    setMeta('twitter:title', finalTitle)
    setMeta('twitter:description', finalDesc)
    if (image) setMeta('twitter:image', image)

    // Article meta
    if (type === 'article' && publishedTime) {
      setMeta('article:published_time', publishedTime, true)
    }

    // Canonical URL
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
    if (!canonical) {
      canonical = document.createElement('link')
      canonical.setAttribute('rel', 'canonical')
      document.head.appendChild(canonical)
    }
    canonical.setAttribute('href', `${SITE_URL}${location.pathname}`)

    // No index
    if (noIndex) {
      setMeta('robots', 'noindex, nofollow')
    } else {
      removeMeta('robots')
    }

    // Cleanup on unmount
    return () => {
      // Cleanup is handled by next useEffect run
    }
  }, [finalTitle, finalDesc, keywords, image, type, publishedTime, noIndex, location.pathname])

  return null
}