// 关于我们 — 公司介绍 + 里程碑 + 联系方式
import type { Metadata } from "next";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

interface SiteConfig {
  site_name?: string;
  site_company_name?: string;
  site_logo_url?: string;
  site_contact_email?: string;
  site_contact_phone?: string;
  site_about_content?: string;
  site_about_milestones?: string;
}

async function fetchSiteConfig(): Promise<SiteConfig> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/site-config`, { cache: "no-store" });
    if (res.ok) return await res.json();
  } catch {
    // Public pages remain usable when the optional site-config service is unavailable.
  }
  return {};
}

export const metadata: Metadata = {
  // title 不含品牌后缀：根 layout 的 title 模板 "%s — 3Cloud" 会统一追加一次品牌，避免重复
  title: "关于我们",
  description: "了解 3Cloud 平台，AI API 聚合平台的使命、团队与发展历程",
  openGraph: {
    title: "关于我们 — 3Cloud",
    description: "了解 3Cloud 平台，AI API 聚合平台的使命、团队与发展历程",
    type: "website",
  },
};

// 默认里程碑（后台未配置时使用）
const DEFAULT_MILESTONES = [
  { date: "2025-Q1", title: "项目立项", desc: "3Cloud 平台立项，确定技术架构与产品方向" },
  { date: "2025-Q2", title: "核心引擎开发", desc: "完成智能路由、统一计费、多供应商接入等核心模块" },
  { date: "2025-Q3", title: "内测上线", desc: "首批内测用户接入，验证平台稳定性与定价模型" },
  { date: "2025-Q4", title: "公测发布", desc: "开放注册，支持 DeepSeek、Qwen、GLM 等主流模型" },
  { date: "2026-Q1", title: "供应商体系完善", desc: "多级代理体系上线，支持供应商自助入驻" },
  { date: "2026-Q2", title: "运营体系搭建", desc: "财务对账、风控安全、客服工单等运营模块全面上线" },
  { date: "2026-Q3", title: "正式发布", desc: "官网与品牌升级，面向全球开发者提供 AI API 聚合服务" },
];

/** 品牌母题：线性 SVG 图标（替代 emoji） */
function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

const TECH_STACK = [
  { label: "后端框架", value: "Fastify 5 + TypeScript" },
  { label: "数据库", value: "PostgreSQL 17 + DrizzleORM" },
  { label: "缓存", value: "Redis (Memurai)" },
  { label: "前端框架", value: "React 19 + Next.js 15" },
  { label: "运维部署", value: "PM2 + Nginx + 宝塔" },
  { label: "代码仓库", value: "GitHub + pnpm Monorepo" },
];

export default async function AboutPage() {
  const config = await fetchSiteConfig();
  const siteName = config.site_name ?? "3Cloud";
  const companyName = config.site_company_name ?? siteName;

  // 解析后台配置的里程碑 JSON（如果有）
  let milestones = DEFAULT_MILESTONES;
  if (config.site_about_milestones) {
    try {
      const parsed = JSON.parse(config.site_about_milestones);
      if (Array.isArray(parsed)) milestones = parsed;
    } catch {
      // Ignore malformed administrator-provided milestone JSON and use defaults.
    }
  }

  return (
    <div>
      {/* ===== Hero ===== */}
      <section className="page-hero">
        <div className="container anim-fade-in">
          <span className="overline">About Us</span>
          <h1>关于 {siteName}</h1>
          <p className="page-subtitle">
            AI API 聚合平台 — 让开发者用一套 API 接入全球 AI 模型
          </p>
        </div>
      </section>

      {/* ===== 平台介绍 ===== */}
      <section className="section" style={{ paddingBottom: "var(--space-6xl)" }}>
        <div className="prose anim-fade-in-up">
          {config.site_about_content ? (
            <div dangerouslySetInnerHTML={{ __html: config.site_about_content }} />
          ) : (
            <>
              <p>
                <strong>{companyName}</strong> 是一个 AI API 聚合平台。我们从多家上游模型供应商批量采购 API 能力，通过智能路由和精细计费系统，转售给下游开发者与企业用户，同时提供多级分销（代理商体系）、全链路监控告警、安全风控和运营管理工具。
              </p>
              <p>
                平台本质上是一个 AI API 中间层 — 将多家供应商的模型能力整合为统一标准接口，开发者只需一套 API Key 即可接入
                DeepSeek、OpenAI、Anthropic、Google、智谱、Moonshot 等全球主流 AI 模型，无需逐一签约和对接。
              </p>
              <p>
                我们的使命是<strong>降低 AI 能力的使用门槛</strong>，让每一位开发者都能以最低的成本、最简单的方式调用最先进的 AI 模型。
                无论是独立开发者、创业团队还是中大型企业，3Cloud 都提供灵活的计费方案和专业的技术支持。
              </p>
              <h3>核心价值</h3>
              <ul>
                <li><strong>统一接入：</strong>一套 API Key，跨供应商调用 200+ 模型</li>
                <li><strong>智能路由：</strong>自动选择最优供应商，故障自动切换</li>
                <li><strong>透明定价：</strong>按 Token 计费，价格公开，无隐藏费用</li>
                <li><strong>稳定可靠：</strong>多通道灾备熔断，SLA 保障</li>
              </ul>
            </>
          )}
        </div>
      </section>

      {/* ===== 里程碑时间线 ===== */}
      <section className="band-gray section">
        <div className="container">
          <div className="section-head">
            <span className="overline">Milestones</span>
            <h2 className="section-title">发展历程</h2>
          </div>
          <div className="timeline">
            {milestones.map((m: any, i: number) => (
              <div key={i} className={`timeline-item anim-fade-in-up anim-fade-in-up-d${(i % 4) + 1}`}>
                <div className="timeline-dot" />
                <div className="timeline-card">
                  <div className="timeline-date">{m.date}</div>
                  <h3>{m.title}</h3>
                  <p>{m.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 技术架构 ===== */}
      <section className="section container">
        <div className="section-head">
          <span className="overline">Engineering</span>
          <h2 className="section-title">技术架构</h2>
          <p className="section-subtitle">成熟稳定的技术栈，支撑高并发 AI 网关</p>
        </div>
        <div className="feature-grid">
          {TECH_STACK.map((t) => (
            <div key={t.label} className="feature-card" style={{ textAlign: "center" }}>
              <div style={{ fontSize: "var(--font-size-small)", color: "var(--color-text-muted)", marginBottom: "var(--space-sm)" }}>{t.label}</div>
              <div style={{ fontWeight: 600, color: "var(--color-text)" }}>{t.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 联系方式 ===== */}
      <section className="band-dark section">
        <div className="container" style={{ textAlign: "center" }}>
          <span className="overline">Contact</span>
          <h2 className="section-title" style={{ color: "var(--color-text-inverse)" }}>联系我们</h2>
          <p className="section-subtitle" style={{ color: "var(--color-text-inverse-secondary)" }}>
            有任何问题、合作意向或建议，欢迎联系我们
          </p>
          <div className="contact-grid" style={{ marginTop: "var(--space-5xl)" }}>
            <div className="contact-item">
              <div className="contact-icon"><MailIcon /></div>
              <div className="contact-label" style={{ color: "var(--color-text-inverse-muted)" }}>邮箱</div>
              {config.site_contact_email ? (
                <a className="contact-value" href={`mailto:${config.site_contact_email}`} style={{ color: "var(--color-text-inverse)" }}>{config.site_contact_email}</a>
              ) : (
                <div className="contact-value" style={{ color: "var(--color-text-inverse-secondary)" }}>support@unmisa.com</div>
              )}
            </div>
            {config.site_contact_phone && (
              <div className="contact-item">
                <div className="contact-icon"><PhoneIcon /></div>
                <div className="contact-label" style={{ color: "var(--color-text-inverse-muted)" }}>电话</div>
                <div className="contact-value" style={{ color: "var(--color-text-inverse)" }}>{config.site_contact_phone}</div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
