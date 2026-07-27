import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Zap } from 'lucide-react'
import { useSiteConfig } from '@/hooks/use-site-config'

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
            AI Token 聚合平台
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-tight">
            一个 API，
            <br />
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              接入 <CountUp to={stats.models} />+ AI 模型
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed">
            {siteName} 聚合 DeepSeek、OpenAI、Anthropic 等多家顶级 AI 厂商，
            提供统一的 API 接入体验、智能路由调度与透明的按量计费。
          </p>

          {/* Live stats ticker */}
          <div className="mt-8 flex items-center justify-center gap-8 text-sm">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600"><CountUp to={stats.models} />+</div>
              <div className="text-slate-400 mt-0.5">AI 模型</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600"><CountUp to={stats.users} />+</div>
              <div className="text-slate-400 mt-0.5">注册用户</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{fmtBig(stats.tokens)}+</div>
              <div className="text-slate-400 mt-0.5">累计 Token</div>
            </div>
          </div>

          <div className="mt-10 flex items-center justify-center gap-4 flex-wrap">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-lg shadow-blue-600/25"
            >
              免费注册
              <ArrowRight size={18} />
            </Link>
            <Link
              to="/docs"
              className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-colors"
            >
              查看文档
            </Link>
          </div>

          <p className="mt-6 text-sm text-slate-400">
            完全兼容 OpenAI SDK | 支持流式响应 | 分钟级接入
          </p>
        </div>
      </div>
    </section>
  )
}
