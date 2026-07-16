import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, X, ChevronRight } from 'lucide-react'
import { useSiteConfig } from '@/hooks/use-site-config'

const NAV_LINKS = [
  { href: '/', label: '首页' },
  { href: '/models', label: '模型' },
  { href: '/pricing', label: '定价' },
  { href: '/docs', label: '文档' },
]

export default function PortalHeader() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const { config: siteConfig } = useSiteConfig()

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 10) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  return (
    <header
      className={`sticky top-0 z-50 transition-colors ${
        scrolled
          ? 'bg-white/80 backdrop-blur-md border-b border-slate-200/60 shadow-sm'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0">
            {siteConfig?.site_logo_url ? (
              <img
                src={siteConfig.site_logo_url}
                alt={siteConfig.site_name || 'Logo'}
                className="h-8 max-w-[180px] object-contain"
              />
            ) : (
              <>
                <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">3C</span>
                </div>
                <span className="text-lg font-bold text-slate-900">{siteConfig?.site_name || '3Cloud'}</span>
              </>
            )}
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const isActive = link.href === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(link.href)
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-blue-600 bg-blue-50'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {link.label}
                </Link>
              )
            })}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-2">
            <Link
              to="/login"
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
            >
              登录
            </Link>
            <Link
              to="/register"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
            >
              免费注册
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white">
          <div className="px-4 py-3 space-y-1">
            {NAV_LINKS.map((link) => {
              const isActive = link.href === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(link.href)
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-blue-600 bg-blue-50'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {link.label}
                  <ChevronRight size={16} className="text-slate-400" />
                </Link>
              )
            })}
          </div>
          <div className="px-4 py-3 border-t border-slate-100 flex gap-2">
            <Link
              to="/login"
              className="flex-1 text-center px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              登录
            </Link>
            <Link
              to="/register"
              className="flex-1 text-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              免费注册
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
