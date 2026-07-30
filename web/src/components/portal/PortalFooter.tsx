import { Link } from 'react-router-dom'
import { useSiteConfig } from '@/hooks/use-site-config'
import { useI18n } from '@/hooks/useI18n'
import { ExternalLink } from 'lucide-react'

const YEAR = new Date().getFullYear()

function buildCompanyLinks(config: Record<string, string> | null, t: any) {
  const email = config?.site_contact_email
  const phone = config?.site_contact_phone
  const links = [
    { label: t('footer.about_us'), href: '#' },
    { label: t('footer.contact_us'), href: '#' },
  ]
  if (email) {
    links[1] = { label: t('footer.contact_us'), href: `mailto:${email}` }
  }
  if (!email && phone) {
    links[1] = { label: t('footer.contact_phone'), href: `tel:${phone}` }
  }
  return links
}

function buildSupportLinks(config: Record<string, string> | null, t: any) {
  const email = config?.site_contact_email
  const links = [
    { label: t('footer.faq'), href: '/pricing' },
    { label: t('footer.email_support'), href: '#' },
  ]
  if (email) {
    links[1] = { label: t('footer.email_support'), href: `mailto:${email}` }
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
  const { t } = useI18n()
  const { config } = useSiteConfig()
  const copyright = buildCopyright(config)

  const FOOTER_LINKS = [
    {
      title: t('footer.products'),
      links: [
        { label: t('nav.models'), href: '/models' },
        { label: t('nav.pricing'), href: '/pricing' },
        { label: t('nav.docs'), href: '/docs' },
      ],
    },
    {
      title: t('footer.resources'),
      links: [
        { label: t('nav.docs'), href: '/docs' },
        { label: t('footer.guide'), href: '/docs' },
        { label: t('footer.code_samples'), href: '/docs' },
      ],
    },
    {
      title: t('footer.company'),
      links: [
        { label: t('footer.about_us'), href: '#' },
        { label: t('footer.contact_us'), href: '#' },
      ],
    },
    {
      title: t('footer.support'),
      links: [
        { label: t('footer.faq'), href: '/pricing' },
        { label: t('footer.email_support'), href: '#' },
      ],
    },
  ]

  const companyLinks = buildCompanyLinks(config, t)
  const supportLinks = buildSupportLinks(config, t)

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
              <p className="text-xs text-slate-500 mb-2">{t('footer.follow_wechat')}</p>
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
              {config?.site_name || '3Cloud'} — {t('footer.brand_suffix')}
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
