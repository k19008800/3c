import type { Metadata } from "next";
import "./globals.css";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3030";

interface SiteConfig {
  site_name?: string;
  site_logo_url?: string;
  site_icp?: string;
  site_icp_link?: string;
  site_police_icp?: string;
  site_copyright?: string;
  site_footer_html?: string;
  site_contact_email?: string;
}

async function fetchSiteConfig(): Promise<SiteConfig> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/site-config`, { cache: "no-store" });
    if (res.ok) return await res.json();
  } catch {}
  return {};
}

export const metadata: Metadata = {
  title: {
    default: "3Cloud — 一站式 AI API 聚合平台",
    template: "%s — 3Cloud",
  },
  description: "统一接入 DeepSeek、Qwen、GLM、GPT、Claude 等主流模型，智能路由、统一计费、精细运营，一套 API 搞定全部模型",
  openGraph: {
    title: "3Cloud — 一站式 AI API 聚合平台",
    description: "统一计费、智能路由、精细运营",
    type: "website",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const config = await fetchSiteConfig();
  const siteName = config.site_name ?? "3Cloud";
  const year = new Date().getFullYear();
  const copyright = config.site_copyright ?? `© ${year} ${siteName} · AI Token 聚合平台`;

  return (
    <html lang="zh-CN">
      <body>
        {/* ===== Header ===== */}
        <header
          style={{
            borderBottom: "1px solid #e2e8f0",
            padding: "0 24px",
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#fff",
            position: "sticky",
            top: 0,
            zIndex: 100,
          }}
        >
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, fontSize: 20, color: "#0f172a", textDecoration: "none" }}>
            {config.site_logo_url ? (
              <img src={config.site_logo_url} alt={siteName} style={{ height: 32 }} />
            ) : (
              <span style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", color: "#fff", borderRadius: 6, padding: "4px 12px", fontSize: 16 }}>
                {siteName}
              </span>
            )}
          </a>
          <nav style={{ display: "flex", gap: 24, alignItems: "center" }}>
            <a href="/" style={{ color: "#475569", textDecoration: "none", fontSize: 14 }}>首页</a>
            <a href="/models" style={{ color: "#475569", textDecoration: "none", fontSize: 14 }}>模型目录</a>
            <a href="/pricing" style={{ color: "#475569", textDecoration: "none", fontSize: 14 }}>定价</a>
            <a href="/about" style={{ color: "#475569", textDecoration: "none", fontSize: 14 }}>关于我们</a>
            <a href="/status" style={{ color: "#475569", textDecoration: "none", fontSize: 14 }}>系统状态</a>
            <a href="/login" style={{ background: "#2563eb", color: "#fff", padding: "8px 20px", borderRadius: 6, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>
              登录
            </a>
          </nav>
        </header>

        <main style={{ minHeight: "calc(100vh - 64px)" }}>{children}</main>

        {/* ===== Footer ===== */}
        <footer style={{ borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
          <div style={{ maxWidth: 1000, margin: "0 auto", padding: "48px 24px 32px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 32, marginBottom: 32 }}>
              {/* 产品 */}
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "#0f172a" }}>产品</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <a href="/models" style={{ color: "#64748b", textDecoration: "none", fontSize: 13 }}>模型目录</a>
                  <a href="/pricing" style={{ color: "#64748b", textDecoration: "none", fontSize: 13 }}>定价方案</a>
                  <a href="/status" style={{ color: "#64748b", textDecoration: "none", fontSize: 13 }}>系统状态</a>
                </div>
              </div>
              {/* 资源 */}
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "#0f172a" }}>资源</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <a href="/about" style={{ color: "#64748b", textDecoration: "none", fontSize: 13 }}>关于我们</a>
                  <a href="/help" style={{ color: "#64748b", textDecoration: "none", fontSize: 13 }}>帮助中心</a>
                  {config.site_contact_email && <span style={{ color: "#64748b", fontSize: 13 }}>{config.site_contact_email}</span>}
                </div>
              </div>
              {/* 法律 */}
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "#0f172a" }}>法律</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <a href="/privacy" style={{ color: "#64748b", textDecoration: "none", fontSize: 13 }}>隐私政策</a>
                  <a href="/terms" style={{ color: "#64748b", textDecoration: "none", fontSize: 13 }}>服务条款</a>
                </div>
              </div>
            </div>

            {/* 版权 & 备案 */}
            <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 24, textAlign: "center", fontSize: 13, color: "#94a3b8", lineHeight: 1.8 }}>
              {config.site_footer_html ? (
                <div dangerouslySetInnerHTML={{ __html: config.site_footer_html }} />
              ) : (
                <>
                  <div>{copyright}</div>
                  {config.site_icp && (
                    <div style={{ marginTop: 4 }}>
                      {config.site_icp_link ? (
                        <a href={config.site_icp_link} target="_blank" rel="noopener noreferrer" style={{ color: "#94a3b8", textDecoration: "none" }}>
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
