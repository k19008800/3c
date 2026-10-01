import type { Metadata } from "next";
import "./globals.css";
import { fetchDictionary, makeT, siteAlternates } from "../lib/i18n";
import { getCookieLang } from "../lib/i18n-server";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { ButtonHelp } from "../components/Help";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

interface SiteConfig {
  site_name?: string;
  site_logo_url?: string;
  site_icp?: string;
  site_icp_link?: string;
  site_police_icp?: string;
  site_copyright?: string;
  site_footer_html?: string;
  site_contact_email?: string;
  site_company_name?: string;
  site_contact_phone?: string;
}

async function fetchSiteConfig(): Promise<SiteConfig> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/site-config`, { cache: "no-store" });
    if (res.ok) return await res.json();
  } catch {
    // Keep the portal renderable when the optional site-config service is unavailable.
  }
  return {};
}

export const metadata: Metadata = {
  title: {
    default: "浩寅云 — 一站式 AI API 聚合平台",
    template: "%s — 浩寅云",
  },
  description: "统一接入 DeepSeek、Qwen、GLM、GPT、Claude 等主流模型，智能路由、统一计费、精细运营，一套 API 搞定全部模型",
  openGraph: {
    title: "浩寅云 — 一站式 AI API 聚合平台",
    description: "统一计费、智能路由、精细运营",
    type: "website",
  },
  // hreflang：cookie 方案下 en 直链为 ?lang=en（全站子路径化见交付报告取舍说明）
  alternates: siteAlternates("/"),
};

/** 品牌母题：节点星座线描 SVG（替代原紫渐变徽章） */
function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" stroke="currentColor" strokeWidth="2" />
      <circle cx="11" cy="11" r="2.2" fill="currentColor" />
      <circle cx="21.5" cy="9.5" r="2.2" fill="currentColor" />
      <circle cx="16" cy="19" r="2.2" fill="currentColor" />
      <circle cx="23" cy="22" r="2.2" fill="currentColor" />
      <path
        d="M12.8 12.3 19.7 10.6M12.5 12.8l2.2 4.3M18 17.6l3.4 3.6"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

/** 汉堡图标（移动端） */
function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M2.5 4.5h13M2.5 9h13M2.5 13.5h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [config, lang] = await Promise.all([fetchSiteConfig(), getCookieLang()]);
  const dict = await fetchDictionary(lang);
  const t = makeT(dict);

  const siteName = config.site_name ?? "浩寅云";
  const year = new Date().getFullYear();
  const copyright = config.site_copyright ?? `© ${year} ${siteName} · AI Token 聚合平台`;

  const navItems = [
    { href: "/", label: t("nav.home") },
    { href: "/models", label: t("nav.models") },
    { href: "/pricing", label: t("nav.pricing") },
    { href: "/blog", label: t("nav.blog") },
    { href: "/about", label: t("nav.about") },
    { href: "/status", label: t("nav.status") },
  ];

  return (
    <html lang={lang === "en" ? "en" : "zh-CN"}>
      <body>
        {/* ===== Header ===== */}
        <header className="portal-header">
          <div className="portal-header-inner">
            <a href="/" className="brand">
              {config.site_logo_url ? (
                <img src={config.site_logo_url} alt={siteName} style={{ height: 32 }} />
              ) : (
                <>
                  <BrandMark />
                  <span>{siteName}</span>
                </>
              )}
            </a>

            {/* 桌面导航 */}
            <nav className="portal-nav desktop-nav" aria-label="primary">
              {navItems.map((item) => (
                <a key={item.href} href={item.href} className="nav-link">
                  {item.label}
                </a>
              ))}
            </nav>

            <div className="portal-header-actions">
              <span className="desktop-nav">
                <LanguageSwitcher current={lang} />
              </span>
              <a href="/app/login" className="btn btn-primary">
                {t("nav.login")}
              </a>
              <ButtonHelp text="登录 浩寅云 控制台；未注册用户可先注册。" />

              {/* 移动端汉堡 / 抽屉（原生 details，零 JS） */}
              <details className="portal-menu-toggle">
                <summary aria-label="菜单">
                  <MenuIcon />
                </summary>
                <div className="portal-menu-panel">
                  {navItems.map((item) => (
                    <a key={item.href} href={item.href} className="nav-link">
                      {item.label}
                    </a>
                  ))}
                  <div className="portal-menu-lang">
                    <LanguageSwitcher current={lang} />
                  </div>
                </div>
              </details>
            </div>
          </div>
        </header>

        <main>{children}</main>

        {/* ===== Footer ===== */}
        <footer className="portal-footer">
          <div className="portal-footer-inner">
            <div className="portal-footer-grid">
              {/* 产品 */}
              <div>
                <h4>{t("footer.product")}</h4>
                <div className="portal-footer-links">
                  <a href="/models">{t("nav.models")}</a>
                  <a href="/pricing">{t("nav.pricing")}</a>
                  <a href="/status">{t("nav.status")}</a>
                </div>
              </div>
              {/* 资源 */}
              <div>
                <h4>{t("footer.resources")}</h4>
                <div className="portal-footer-links">
                  <a href="/blog">{t("nav.blog")}</a>
                  <a href="/about">{t("nav.about")}</a>
                  <a href="/app/help">Help Center</a>
                  {config.site_company_name && <span>{config.site_company_name}</span>}
                  {config.site_contact_email && <span>{config.site_contact_email}</span>}
                  {config.site_contact_phone && <span>{config.site_contact_phone}</span>}
                </div>
              </div>
              {/* 法律 */}
              <div>
                <h4>{t("footer.legal")}</h4>
                <div className="portal-footer-links">
                  <a href="/privacy">Privacy Policy</a>
                  <a href="/terms">Terms of Service</a>
                </div>
              </div>
            </div>

            {/* 版权 & 备案 */}
            <div className="portal-footer-legal">
              {config.site_footer_html ? (
                <div dangerouslySetInnerHTML={{ __html: config.site_footer_html }} />
              ) : (
                <>
                  <div>{copyright}</div>
                  {config.site_icp && (
                    <div>
                      {config.site_icp_link ? (
                        <a href={config.site_icp_link} target="_blank" rel="noopener noreferrer">
                          {config.site_icp}
                        </a>
                      ) : (
                        <span>{config.site_icp}</span>
                      )}
                      {config.site_police_icp && <span style={{ marginLeft: 12 }}>{config.site_police_icp}</span>}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
