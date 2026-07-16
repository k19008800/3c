import { Link } from 'react-router-dom'
import { useSiteConfig } from '@/hooks/use-site-config'

const FOOTER_LINKS = [
  {
    title: '产品',
    links: [
      { label: '模型目录', href: '/models' },
      { label: '定价', href: '/pricing' },
      { label: 'API 文档', href: '/docs' },
    ],
  },
  {
    title: '资源',
    links: [
      { label: 'API 文档', href: '/docs' },
      { label: '使用指南', href: '/docs' },
      { label: '代码示例', href: '/docs' },
    ],
  },
  {
    title: '公司',
    links: [
      { label: '关于我们', href: '#' },
      { label: '联系我们', href: 'mailto:support@unmisa.com' },
    ],
  },
  {
    title: '支持',
    links: [
      { label: '常见问题', href: '/pricing' },
      { label: '邮件支持', href: 'mailto:support@unmisa.com' },
    ],
  },
]

const YEAR = new Date().getFullYear()

function buildCopyrightText(config: Record<string, string> | null): string {
  // 优先使用完整的 copyright 字段
  if (config?.site_copyright) {
    return config.site_copyright.replace(/\(c\)|{year}|%year%/gi, String(YEAR))
  }

  const company = config?.site_company_name || '衢州云务网络科技有限公司'
  const icp = config?.site_icp || '浙ICP备XXXXXXXX号'
  return `© ${YEAR} ${company} | ${icp}`
}

export default function PortalFooter() {
  const { config } = useSiteConfig()

  return (
    <footer className="bg-slate-900 text-slate-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {FOOTER_LINKS.map((group) => (
            <div key={group.title}>
              <h4 className="text-sm font-semibold text-white mb-3">{group.title}</h4>
              <ul className="space-y-2">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.href}
                      className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-indigo-500 rounded flex items-center justify-center">
              <span className="text-white font-bold text-[10px]">3C</span>
            </div>
            <span className="text-sm text-slate-400">3Cloud — AI Token 聚合平台</span>
          </div>
          <div className="text-sm text-slate-500">
            {buildCopyrightText(config)}
          </div>
        </div>
      </div>
    </footer>
  )
}
