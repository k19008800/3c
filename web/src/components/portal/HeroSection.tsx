import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Zap } from 'lucide-react'
import { useSiteConfig } from '@/hooks/use-site-config'
import { useI18n } from '@/hooks/useI18n'

function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const [val, setVal] = useState(0)
  const ref = useRef<boolean>(false)

  useEffect(() => {
    if (ref.current) return
    ref.current = true
    const duration = 1500
    const start = performance.now()
    const step = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(Math.round(eased * to))
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [to])

  return <>{val}{suffix}</>
}

export default function HeroSection() {
  const { t } = useI18n()
  const { config: siteConfig } = useSiteConfig()
  const siteName = siteConfig?.site_name || '3Cloud'

  const [stats, setStats] = useState({ models: 130, users: 813, tokens: 595893775 })

  useEffect(() => {
    fetch('/api/v1/public/stats')
      .then(r => r.json())
      .then(d => { if (d?.code === 0 && d?.data) setStats(d.data) })
      .catch(() => {})
  }, [])

  const fmtBig = (n: number) => {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
    return String(n)
  }

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-indigo-50 pointer-events-none" />
      <div className="absolute top-20 left-10 w-72 h-72 bg-blue-200/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-indigo-200/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 lg:py-36">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-100 text-blue-700 text-sm font-medium mb-6">
            <Zap size={16} />
            {t('hero.badge')}
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-tight">
            {t('hero.headline', { count: stats.models }).split('{count}')[0]}
            <br />
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              {t('hero.headline_highlight', { count: stats.models })}
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed">
            {siteName} {t('hero.subtitle')}
          </p>

          {/* Live stats ticker */}
          <div className="mt-8 flex items-center justify-center gap-8 text-sm">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600"><CountUp to={stats.models} />+</div>
              <div className="text-slate-400 mt-0.5">{t('stats.models')}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600"><CountUp to={stats.users} />+</div>
              <div className="text-slate-400 mt-0.5">{t('stats.users')}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{fmtBig(stats.tokens)}+</div>
              <div className="text-slate-400 mt-0.5">{t('stats.tokens')}</div>
            </div>
          </div>

          <div className="mt-10 flex items-center justify-center gap-4 flex-wrap">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-lg shadow-blue-600/25"
            >
              {t('hero.cta_start')}
              <ArrowRight size={18} />
            </Link>
            <Link
              to="/docs"
              className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-colors"
            >
              {t('hero.cta_learn')}
            </Link>
          </div>

          <p className="mt-6 text-sm text-slate-400">
            {t('hero.compat')}
          </p>
        </div>
      </div>
    </section>
  )
}
