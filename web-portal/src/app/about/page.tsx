// 关于我们 — 公司介绍 + 里程碑 + 联系方式
import type { Metadata } from "next";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3030";

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
  } catch {}
  return {};
}

export const metadata: Metadata = {
  title: "关于我们 — 3Cloud",
  description: "了解 3Cloud 平台，AI API 聚合平台的使命、团队与发展历程",
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
    } catch {}
  }

  return (
    <div>
      {/* ===== Hero ===== */}
      <section style={{ textAlign: "center", padding: "80px 24px 60px", background: "linear-gradient(180deg,#eff6ff,#fff)" }}>
        <div className="anim-fade-in">
          <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 12 }}>关于 {siteName}</h1>
          <p style={{ fontSize: 16, color: "#475569", maxWidth: 560, margin: "0 auto" }}>
            AI API 聚合平台 — 让开发者用一套 API 接入全球 AI 模型
          </p>
        </div>
      </section>

      {/* ===== 平台介绍 ===== */}
      <section style={{ maxWidth: 800, margin: "0 auto 60px", padding: "0 24px" }}>
        <div className="anim-fade-in-up" style={{ lineHeight: 1.9, fontSize: 15, color: "#334155" }}>
          {config.site_about_content ? (
            <div dangerouslySetInnerHTML={{ __html: config.site_about_content }} />
          ) : (
            <>
              <p style={{ marginBottom: 16 }}>
                <strong>{companyName}</strong> 是一个 AI API 聚合平台。我们从多家上游模型供应商批量采购 API 能力，通过智能路由和精细计费系统，转售给下游开发者与企业用户，同时提供多级分销（代理商体系）、全链路监控告警、安全风控和运营管理工具。
              </p>
              <p style={{ marginBottom: 16 }}>
                平台本质上是一个 AI API 中间层 — 将多家供应商的模型能力整合为统一标准接口，开发者只需一套 API Key 即可接入
                DeepSeek、OpenAI、Anthropic、Google、智谱、Moonshot 等全球主流 AI 模型，无需逐一签约和对接。
              </p>
              <p style={{ marginBottom: 16 }}>
                我们的使命是<strong>降低 AI 能力的使用门槛</strong>，让每一位开发者都能以最低的成本、最简单的方式调用最先进的 AI 模型。
                无论是独立开发者、创业团队还是中大型企业，3Cloud 都提供灵活的计费方案和专业的技术支持。
              </p>
              <h3 style={{ fontSize: 20, fontWeight: 700, margin: "32px 0 12px" }}>核心价值</h3>
              <ul style={{ paddingLeft: 20, marginBottom: 24 }}>
                <li style={{ marginBottom: 8 }}><strong>统一接入：</strong>一套 API Key，跨供应商调用 200+ 模型</li>
                <li style={{ marginBottom: 8 }}><strong>智能路由：</strong>自动选择最优供应商，故障自动切换</li>
                <li style={{ marginBottom: 8 }}><strong>透明定价：</strong>按 Token 计费，价格公开，无隐藏费用</li>
                <li style={{ marginBottom: 8 }}><strong>稳定可靠：</strong>多通道灾备熔断，SLA 保障</li>
              </ul>
            </>
          )}
        </div>
      </section>

      {/* ===== 里程碑时间线 ===== */}
      <section style={{ background: "#f8fafc", padding: "60px 24px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", fontSize: 28, fontWeight: 700, marginBottom: 48 }}>发展历程</h2>
          <div style={{ position: "relative" }}>
            {/* 时间线竖线 */}
            <div style={{ position: "absolute", left: 24, top: 8, bottom: 8, width: 2, background: "#e2e8f0" }} />
            {milestones.map((m: any, i: number) => (
              <div key={i} className={`anim-fade-in-up anim-fade-in-up-d${(i % 4) + 1}`} style={{ position: "relative", paddingLeft: 56, paddingBottom: 40 }}>
                {/* 时间线圆点 */}
                <div style={{ position: "absolute", left: 16, top: 8, width: 18, height: 18, borderRadius: "50%", background: "#2563eb", border: "3px solid #fff", boxShadow: "0 0 0 2px #2563eb" }} />
                <div style={{ background: "#fff", borderRadius: 10, padding: "16px 20px", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 13, color: "#2563eb", fontWeight: 600, marginBottom: 4 }}>{m.date}</div>
                  <h3 style={{ fontSize: 17, marginBottom: 4 }}>{m.title}</h3>
                  <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.6 }}>{m.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 团队介绍 ===== */}
      <section style={{ maxWidth: 800, margin: "60px auto", padding: "0 24px" }}>
        <h2 style={{ textAlign: "center", fontSize: 28, fontWeight: 700, marginBottom: 32 }}>技术架构</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20 }}>
          {[
            { label: "后端框架", value: "Fastify 5 + TypeScript" },
            { label: "数据库", value: "PostgreSQL 17 + DrizzleORM" },
            { label: "缓存", value: "Redis (Memurai)" },
            { label: "前端框架", value: "React 19 + Next.js 15" },
            { label: "运维部署", value: "PM2 + Nginx + 宝塔" },
            { label: "代码仓库", value: "GitHub + pnpm Monorepo" },
          ].map((t) => (
            <div key={t.label} style={{ background: "#fff", borderRadius: 10, padding: "20px", border: "1px solid #e2e8f0", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 6 }}>{t.label}</div>
              <div style={{ fontWeight: 600, color: "#0f172a" }}>{t.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 联系方式 ===== */}
      <section style={{ background: "#f8fafc", padding: "60px 24px" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>联系我们</h2>
          <p style={{ color: "#64748b", marginBottom: 32, fontSize: 15 }}>
            有任何问题、合作意向或建议，欢迎联系我们
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 40, flexWrap: "wrap" }}>
            {config.site_contact_email && (
              <div>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📧</div>
                <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 4 }}>邮箱</div>
                <a href={`mailto:${config.site_contact_email}`} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>{config.site_contact_email}</a>
              </div>
            )}
            {config.site_contact_phone && (
              <div>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📞</div>
                <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 4 }}>电话</div>
                <span style={{ fontWeight: 600 }}>{config.site_contact_phone}</span>
              </div>
            )}
            {!config.site_contact_email && !config.site_contact_phone && (
              <div>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📧</div>
                <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 4 }}>邮箱</div>
                <span style={{ color: "#94a3b8" }}>support@unmisa.com</span>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
