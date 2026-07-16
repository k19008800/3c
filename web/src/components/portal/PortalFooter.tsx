import { Link } from 'react-router-dom'
import { useSiteConfig } from '@/hooks/use-site-config'
import { ExternalLink } from 'lucide-react'

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
      { label: '联系我们', href: '#' },
    ],
  },
  {
    title: '支持',
    links: [
      { label: '常见问题', href: '/pricing' },
      { label: '邮件支持', href: '#' },
    ],
  },
]

const YEAR = new Date().getFullYear()

function buildCompanyLinks(config: Record<string, string> | null) {
  const email = config?.site_contact_email
  const phone = config?.site_contact_phone
  const links = [...FOOTER_LINKS[2].links] // copy "公司" links
  // "联系我们" 用邮箱
  if (email) {
    links[1] = { label: '联系我们', href: `mailto:${email}` }
  }
  // 如果只有电话没有邮箱，展示电话
  if (!email && phone) {
    links[1] = { label: '联系电话', href: `tel:${phone}` }
  }
  return links
}

function buildSupportLinks(config: Record<string, string> | null) {
  const email = config?.site_contact_email
  const links = [...FOOTER_LINKS[3].links] // copy "支持" links
  if (email) {
    links[1] = { label: '邮件支持', href: `mailto:${email}` }
  }
  return links
}

interface CopyrightParts {
  text: string
  icpLink: string | null
  icp: string | null
}

function buildCopyright(config: Record<string, string> | null): CopyrightParts {
  const company = config?.site_company_name || ''
  const icp = config?.site_icp || null

  // 优先使用完整的 copyright 字段
  let text: string
  if (config?.site_copyright) {
    text = config.site_copyright.replace(/\(c\)|{year}|%year%/gi, String(YEAR))
  } else {
    text = `© ${YEAR} ${company}`
  }

  return {
    text,
    icpLink: config?.site_icp_link || null,
    icp,
  }
}

export default function PortalFooter() {
  const { config } = useSiteConfig()
  const copyright = buildCopyright(config)
  const companyLinks = buildCompanyLinks(config)
  const supportLinks = buildSupportLinks(config)

  const pageLinkGroups = [
    { ...FOOTER_LINKS[0] }, // 产品
    { ...FOOTER_LINKS[1] }, // 资源
    { title: FOOTER_LINKS[2].title, links: companyLinks },
    { title: FOOTER_LINKS[3].title, links: supportLinks },
  ]

  return (
    <footer className="bg-slate-900 text-slate-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {pageLinkGroups.map((group) => (
            <div key={group.title}>
              <h4 className="text-sm font-semibold text-white mb-3">{group.title}</h4>
              <ul className="space-y-2">
                {group.links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith('mailto:') || link.href.startsWith('tel:') ? (
                      <a
                        href={link.href}
                        className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        to={link.href}
                        className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* 公众号二维码 */}
        {config?.site_wechat_qr_url && (
          <div className="mt-8 flex justify-center">
            <div className="text-center">
              <p className="text-xs text-slate-500 mb-2">关注公众号</p>
              <img
                src={config.site_wechat_qr_url}
                alt="公众号二维码"
                className="w-24 h-24 rounded-lg border border-slate-700 object-contain bg-white mx-auto"
              />
            </div>
          </div>
        )}

        {/* 底部信息 */}
        <div className="mt-10 pt-8 border-t border-slate-800 flex flex-col items-center gap-3 text-center">
          {/* 品牌 */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-indigo-500 rounded flex items-center justify-center">
              <span className="text-white font-bold text-[10px]">3C</span>
            </div>
            <span className="text-sm text-slate-400">
              {config?.site_name || '3Cloud'} — AI Token 聚合平台
            </span>
          </div>

          {/* 联系方式（电话/邮箱） */}
          {(config?.site_contact_email || config?.site_contact_phone) && (
            <div className="flex items-center gap-4 text-sm text-slate-500">
              {config.site_contact_phone && (
                <a href={`tel:${config.site_contact_phone}`} className="hover:text-slate-300 transition-colors">
                  {config.site_contact_phone}
                </a>
              )}
              {config.site_contact_email && (
                <a href={`mailto:${config.site_contact_email}`} className="hover:text-slate-300 transition-colors">
                  {config.site_contact_email}
                </a>
              )}
            </div>
          )}

          {/* 版权 */}
          <div className="text-sm text-slate-500">
            {copyright.text}
          </div>

          {/* ICP 备案 */}
          {copyright.icp && (
            <div className="text-sm text-slate-500">
              {copyright.icpLink ? (
                <a
                  href={copyright.icpLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-slate-300 transition-colors inline-flex items-center gap-0.5"
                >
                  {copyright.icp}
                  <ExternalLink size={10} />
                </a>
              ) : (
                copyright.icp
              )}
            </div>
          )}

          {/* 公安备案 */}
          {config?.site_police_icp && (
            <p className="text-xs text-slate-600">{config.site_police_icp}</p>
          )}

          {/* 自定义页脚 HTML */}
          {config?.site_footer_html && (
            <div
              className="text-xs text-slate-600 mt-1"
              dangerouslySetInnerHTML={{ __html: config.site_footer_html }}
            />
          )}
        </div>
      </div>
    </footer>
  )
}
