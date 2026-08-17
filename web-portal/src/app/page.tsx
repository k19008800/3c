import type { Metadata } from "next";
import { fetchDictionary, makeT, resolveLang, siteAlternates } from "../lib/i18n";
import { getCookieLang } from "../lib/i18n-server";
import { PageHelp } from "../components/Help";

export const dynamic = "force-dynamic";

const API_BASE = "http://127.0.0.1:3000";

// ===== 类型 =====
interface SiteConfig {
  site_name?: string;
  site_logo_url?: string;
  site_favicon_url?: string;
  site_icp?: string;
  site_icp_link?: string;
  site_police_icp?: string;
  site_copyright?: string;
  site_company_name?: string;
  site_contact_email?: string;
  site_contact_phone?: string;
  site_wechat_qr_url?: string;
  site_footer_html?: string;
  site_about_content?: string;
  site_about_milestones?: string;
}

interface Stats {
  models: number;
  vendors: number;
  users: number;
  totalTokens: number;
}

interface PriceItem {
  name: string;
  display_name: string;
  category: string;
  context_length: number;
  description: string | null;
  vendor: string;
  input_price: number;
  output_price: number;
}

// ===== 数据拉取 =====
async function fetchSiteConfig(): Promise<SiteConfig> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/site-config`, { cache: "no-store" });
    if (res.ok) return await res.json();
  } catch {}
  return {};
}

/** 对外 API 接入地址（后台 系统设置 → API 服务 可配置 api_domain） */
async function fetchApiConfig(): Promise<{
  apiDomain: string;
  openaiBaseUrl: string;
  anthropicBaseUrl: string;
  openaiChatUrl: string;
  anthropicMessagesUrl: string;
}> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/api-config`, { cache: "no-store" });
    if (res.ok) {
      const body = await res.json();
      if (body?.data) return body.data;
    }
  } catch {}
  return {
    apiDomain: "api.unmisa.com",
    openaiBaseUrl: "https://api.unmisa.com/v1",
    anthropicBaseUrl: "https://api.unmisa.com/anthropic",
    openaiChatUrl: "https://api.unmisa.com/v1/chat/completions",
    anthropicMessagesUrl: "https://api.unmisa.com/anthropic/v1/messages",
  };
}

async function fetchStats(): Promise<Stats> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/stats`, { cache: "no-store" });
    if (res.ok) return await res.json();
  } catch {}
  return { models: 0, vendors: 0, users: 0, totalTokens: 0 };
}

async function fetchPricing(): Promise<{ pricing: PriceItem[] }> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/pricing`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      // API 返回 { pricing: [{ modelName, supplierName, inputPrice (str), outputPrice (str), ... }] }
      // 映射到页面使用的字段名
      return {
        pricing: (data.pricing ?? []).map((m: any) => ({
          name: m.modelName ?? "",
          display_name: m.modelName ?? "",
          vendor: m.supplierName ?? "",
          category: "对话",
          context_length: 0,
          description: null,
          input_price: parseFloat(m.inputPrice) || 0,
          output_price: parseFloat(m.outputPrice) || 0,
        })),
      };
    }
  } catch {}
  return { pricing: [] };
}

// ===== 工具函数 =====
function formatTokens(t: number): string {
  if (t >= 1_0000_0000) return `${(t / 1_0000_0000).toFixed(1)}亿`;
  if (t >= 1_0000) return `${(t / 1_0000).toFixed(0)}万`;
  return String(t);
}

function formatPrice(p: number): string {
  if (p === 0) return "免费";
  if (p < 0.01) return `¥${p.toFixed(4)}`;
  if (p < 1) return `¥${p.toFixed(3)}`;
  return `¥${p.toFixed(2)}`;
}

const MODEL_CATEGORY_LABELS: Record<string, string> = {
  chat: "对话", embedding: "嵌入", image: "图像", audio: "音频", video: "视频", rerank: "重排",
};

// ===== SEO metadata（按语言翻译） =====
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const lang = resolveLang(sp?.lang, await getCookieLang());
  const dict = await fetchDictionary(lang);
  const t = makeT(dict);
  return {
    title: t("home.hero.title"),
    description: t("home.hero.subtitle"),
    openGraph: {
      title: t("home.hero.title"),
      description: t("home.hero.subtitle"),
      type: "website",
    },
    alternates: siteAlternates("/"),
  };
}

// ===== 首页 =====
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const lang = resolveLang(sp?.lang, await getCookieLang());
  const dict = await fetchDictionary(lang);
  const t = makeT(dict);

  const [config, stats, pricing, apiConfig] = await Promise.all([
    fetchSiteConfig(),
    fetchStats(),
    fetchPricing(),
    fetchApiConfig(),
  ]);

  const siteName = config.site_name ?? "3Cloud";
  const featuredModels = pricing.pricing.slice(0, 8);

  // 按分类聚合去重取热门模型
  const modelsByCategory = new Map<string, PriceItem[]>();
  for (const m of pricing.pricing) {
    const cat = m.category ?? "chat";
    if (!modelsByCategory.has(cat)) modelsByCategory.set(cat, []);
    const arr = modelsByCategory.get(cat)!;
    if (arr.length < 4) arr.push(m);
  }

  const features = [
    { icon: "🔗", title: t("home.features.unified.title"), desc: t("home.features.unified.desc") },
    { icon: "🧭", title: t("home.features.routing.title"), desc: t("home.features.routing.desc") },
    { icon: "📊", title: t("home.features.billing.title"), desc: t("home.features.billing.desc") },
    { icon: "🏢", title: t("home.features.vendors.title"), desc: t("home.features.vendors.desc") },
    { icon: "🔐", title: t("home.features.security.title"), desc: t("home.features.security.desc") },
    { icon: "📱", title: t("home.features.multidevice.title"), desc: t("home.features.multidevice.desc") },
  ];

  const steps = [
    { step: "01", title: t("home.how.step1.title"), desc: t("home.how.step1.desc") },
    { step: "02", title: t("home.how.step2.title"), desc: t("home.how.step2.desc") },
    { step: "03", title: t("home.how.step3.title"), desc: t("home.how.step3.desc") },
  ];

  const faqs = [
    { q: t("home.faq.q1"), a: t("home.faq.a1") },
    { q: t("home.faq.q2"), a: t("home.faq.a2") },
    { q: t("home.faq.q3"), a: t("home.faq.a3") },
    { q: t("home.faq.q4"), a: t("home.faq.a4") },
    { q: t("home.faq.q5"), a: t("home.faq.a5") },
    { q: t("home.faq.q6"), a: t("home.faq.a6") },
    { q: t("home.faq.q7"), a: t("home.faq.a7") },
  ];

  return (
    <div>
      {/* ===== Hero ===== */}
      <section
        style={{
          textAlign: "center",
          padding: "100px 24px 80px",
          background: "linear-gradient(180deg, #eff6ff 0%, #fff 40%, #f0f9ff 100%)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* 背景装饰 */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(37,99,235,0.08) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div className="anim-fade-in" style={{ position: "relative", zIndex: 1 }}>
          <h1 style={{ fontSize: 48, fontWeight: 800, maxWidth: 800, margin: "0 auto 20px", lineHeight: 1.2 }}>
            {t("home.hero.title")}
            <PageHelp text={t("help.home")} />
          </h1>
          <p style={{ fontSize: 18, color: "#475569", maxWidth: 640, margin: "0 auto 36px", lineHeight: 1.7 }}>
            {t("home.hero.subtitle")}
          </p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="/models" style={{ background: "#2563eb", color: "#fff", padding: "14px 32px", borderRadius: 8, textDecoration: "none", fontWeight: 600, fontSize: 16, boxShadow: "0 4px 14px rgba(37,99,235,.35)" }}>
              {t("home.hero.browseModels")}
            </a>
            <a href="/pricing" style={{ border: "1px solid #cbd5e1", color: "#0f172a", background: "#fff", padding: "14px 32px", borderRadius: 8, textDecoration: "none", fontWeight: 600, fontSize: 16 }}>
              {t("home.hero.viewPricing")}
            </a>
            <a href="/app/login" style={{ border: "1px solid #cbd5e1", color: "#475569", padding: "14px 32px", borderRadius: 8, textDecoration: "none" }}>
              {t("home.hero.signup")}
            </a>
          </div>

          {/* 快速接入代码 */}
          <div
            style={{
              maxWidth: 620,
              margin: "48px auto 0",
              background: "#0f172a",
              borderRadius: 10,
              padding: "20px 24px",
              textAlign: "left",
              fontFamily: "Consolas, Monaco, 'Courier New', monospace",
              fontSize: 13,
              color: "#e2e8f0",
              lineHeight: 1.7,
              position: "relative",
            }}
          >
            <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 8 }}>$ {t("home.hero.quickstart")}</div>
            <div><span style={{ color: "#60a5fa" }}>curl</span> {apiConfig.openaiChatUrl} \</div>
            <div>&nbsp;&nbsp;-H <span style={{ color: "#34d399" }}>"Authorization: Bearer YOUR_API_KEY"</span> \</div>
            <div>&nbsp;&nbsp;-H <span style={{ color: "#34d399" }}>"Content-Type: application/json"</span> \</div>
            <div>&nbsp;&nbsp;-d <span style={{ color: "#34d399" }}>'{`{"model":"deepseek-chat","messages":[{"role":"user","content":"你好"}]}`}'</span></div>
          </div>
        </div>
      </section>

      {/* ===== StatsBanner ===== */}
      <section style={{ maxWidth: 1000, margin: "-30px auto 0", padding: "0 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
          {[
            { label: t("home.stats.models"), value: String(stats.models ?? 0), icon: "🧩" },
            { label: t("home.stats.vendors"), value: String(stats.vendors ?? 0), icon: "🏭" },
            { label: t("home.stats.users"), value: String(stats.users ?? 0), icon: "👥" },
            { label: t("home.stats.tokens"), value: formatTokens(stats.totalTokens ?? 0), icon: "⚡" },
          ].map((s, i) => (
            <div key={s.label} className={`anim-fade-in-up anim-fade-in-up-d${i + 1}`} style={{ background: "#fff", borderRadius: 12, padding: "24px 20px", textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,.06)", border: "1px solid #f1f5f9" }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#2563eb" }}>{s.value}</div>
              <div style={{ fontSize: 14, color: "#64748b", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Features ===== */}
      <section style={{ maxWidth: 1000, margin: "80px auto", padding: "0 24px" }}>
        <h2 style={{ textAlign: "center", fontSize: 30, fontWeight: 700, marginBottom: 12 }}>{t("home.features.title")}</h2>
        <p style={{ textAlign: "center", color: "#64748b", marginBottom: 48, fontSize: 16 }}>{t("home.features.subtitle")}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
          {features.map((f, i) => (
            <div key={f.title} className={`anim-fade-in-up anim-fade-in-up-d${(i % 4) + 1}`} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: "28px 24px", background: "#fff", transition: "box-shadow .2s" }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
              <h3 style={{ marginBottom: 8, fontSize: 18 }}>{f.title}</h3>
              <p style={{ color: "#475569", fontSize: 14, lineHeight: 1.7 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Model Catalog Preview ===== */}
      <section style={{ background: "#f8fafc", padding: "80px 24px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", fontSize: 30, fontWeight: 700, marginBottom: 12 }}>{t("home.popular.title")}</h2>
          <p style={{ textAlign: "center", color: "#64748b", marginBottom: 40, fontSize: 16 }}>{t("home.popular.subtitle")}</p>

          {/* 分类标签 */}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 32, flexWrap: "wrap" }}>
            {Array.from(modelsByCategory.keys()).map((cat) => (
              <span key={cat} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 20, padding: "6px 16px", fontSize: 13, color: "#475569" }}>
                {MODEL_CATEGORY_LABELS[cat] ?? cat}
              </span>
            ))}
          </div>

          {/* 模型卡片 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {pricing.pricing.slice(0, 12).map((m) => (
              <div key={`${m.name}-${m.vendor}`} style={{ background: "#fff", borderRadius: 10, padding: "20px 24px", border: "1px solid #e2e8f0", transition: "box-shadow .2s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <strong style={{ fontSize: 15 }}>{m.display_name || m.name}</strong>
                  <span style={{ fontSize: 11, color: "#94a3b8", background: "#f1f5f9", borderRadius: 4, padding: "2px 8px" }}>{MODEL_CATEGORY_LABELS[m.category] ?? m.category}</span>
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12, fontFamily: "monospace" }}>{m.name}</div>
                <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
                  <div><span style={{ fontSize: 11, color: "#94a3b8" }}>{t("home.pricing.input")} </span><span style={{ fontWeight: 600, color: "#2563eb" }}>{formatPrice(m.input_price)}</span><span style={{ fontSize: 11, color: "#94a3b8" }}>/1K</span></div>
                  <div><span style={{ fontSize: 11, color: "#94a3b8" }}>{t("home.pricing.output")} </span><span style={{ fontWeight: 600, color: "#2563eb" }}>{formatPrice(m.output_price)}</span><span style={{ fontSize: 11, color: "#94a3b8" }}>/1K</span></div>
                </div>
                {m.context_length > 0 && <div style={{ fontSize: 11, color: "#94a3b8" }}>{t("home.pricing.context")} {m.context_length.toLocaleString()} tokens</div>}
              </div>
            ))}
          </div>

          <div style={{ textAlign: "center", marginTop: 32 }}>
            <a href="/models" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600, fontSize: 15 }}>
              {t("home.popular.viewAll")} ({pricing.pricing.length}+) →
            </a>
          </div>
        </div>
      </section>

      {/* ===== How It Works ===== */}
      <section style={{ maxWidth: 1000, margin: "80px auto", padding: "0 24px" }}>
        <h2 style={{ textAlign: "center", fontSize: 30, fontWeight: 700, marginBottom: 12 }}>{t("home.how.title")}</h2>
        <p style={{ textAlign: "center", color: "#64748b", marginBottom: 48, fontSize: 16 }}>{t("home.how.subtitle")}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 32 }}>
          {steps.map((s) => (
            <div key={s.step} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 40, fontWeight: 900, color: "#e2e8f0", marginBottom: 8 }}>{s.step}</div>
              <h3 style={{ marginBottom: 8, fontSize: 18 }}>{s.title}</h3>
              <p style={{ color: "#475569", fontSize: 14, lineHeight: 1.7 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Quick Connect ===== */}
      <section style={{ background: "#0f172a", padding: "80px 24px", color: "#fff" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", fontSize: 30, fontWeight: 700, marginBottom: 12 }}>{t("home.dev.title")}</h2>
          <p style={{ textAlign: "center", color: "#94a3b8", marginBottom: 40, fontSize: 16 }}>{t("home.dev.subtitle")}</p>

          {/* 语言切换标签 */}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 24 }}>
            {["cURL", "Python", "JavaScript"].map((langName) => (
              <span key={langName} style={{ background: langName === "cURL" ? "#2563eb" : "transparent", border: langName === "cURL" ? "none" : "1px solid #334155", borderRadius: 6, padding: "6px 18px", fontSize: 13, color: "#fff", cursor: "default" }}>
                {langName}
              </span>
            ))}
          </div>

          {/* 代码块 */}
          <div style={{ background: "#1e293b", borderRadius: 10, padding: "24px 28px", fontFamily: "Consolas, Monaco, 'Courier New', monospace", fontSize: 13, lineHeight: 1.8, overflow: "auto" }}>
            <div style={{ color: "#64748b", marginBottom: 4 }}># Python · OpenAI SDK（base_url = {apiConfig.openaiBaseUrl}）</div>
            <div><span style={{ color: "#fbbf24" }}>from</span> openai <span style={{ color: "#fbbf24" }}>import</span> <span style={{ color: "#60a5fa" }}>OpenAI</span></div>
            <div style={{ marginTop: 8 }}><span style={{ color: "#60a5fa" }}>client</span> = OpenAI(</div>
            <div>&nbsp;&nbsp;api_key=<span style={{ color: "#34d399" }}>"YOUR_API_KEY"</span>,</div>
            <div>&nbsp;&nbsp;base_url=<span style={{ color: "#34d399" }}>"{apiConfig.openaiBaseUrl}"</span></div>
            <div>)</div>
            <div style={{ marginTop: 8 }}><span style={{ color: "#60a5fa" }}>response</span> = client.chat.completions.create(</div>
            <div>&nbsp;&nbsp;model=<span style={{ color: "#34d399" }}>"deepseek-chat"</span>,</div>
            <div>&nbsp;&nbsp;messages=[{`{"role": "user", "content": "你好"}`}]</div>
            <div>)</div>
            <div style={{ marginTop: 8 }}><span style={{ color: "#fbbf24" }}>print</span>(response.choices[0].message.content)</div>
            <div style={{ marginTop: 16, color: "#64748b", borderTop: "1px solid #334155", paddingTop: 12 }}># Anthropic SDK（base_url = {apiConfig.anthropicBaseUrl}，支持 tool_use / 流式）</div>
            <div><span style={{ color: "#fbbf24" }}>from</span> anthropic <span style={{ color: "#fbbf24" }}>import</span> <span style={{ color: "#60a5fa" }}>Anthropic</span></div>
            <div><span style={{ color: "#60a5fa" }}>client</span> = Anthropic(base_url=<span style={{ color: "#34d399" }}>"{apiConfig.anthropicBaseUrl}"</span>, api_key=<span style={{ color: "#34d399" }}>"YOUR_API_KEY"</span>)</div>
            <div>msg = client.messages.create(model=<span style={{ color: "#34d399" }}>"deepseek-chat"</span>, max_tokens=1024, messages=[{`{"role": "user", "content": "你好"}`}])</div>
          </div>
        </div>
      </section>

      {/* ===== Pricing Preview ===== */}
      <section style={{ maxWidth: 1000, margin: "80px auto", padding: "0 24px" }}>
        <h2 style={{ textAlign: "center", fontSize: 30, fontWeight: 700, marginBottom: 12 }}>{t("home.pricing.title")}</h2>
        <p style={{ textAlign: "center", color: "#64748b", marginBottom: 8, fontSize: 16 }}>
          {t("home.pricing.subtitle")}
        </p>

        <div style={{ overflow: "auto", marginTop: 32 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", fontSize: 14, minWidth: 600 }}>
            <thead>
              <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                <th style={{ padding: "12px 16px" }}>{t("home.pricing.model")}</th>
                <th style={{ padding: "12px 16px" }}>{t("home.pricing.category")}</th>
                <th style={{ padding: "12px 16px" }}>{t("home.pricing.input")}</th>
                <th style={{ padding: "12px 16px" }}>{t("home.pricing.output")}</th>
                <th style={{ padding: "12px 16px" }}>{t("home.pricing.context")}</th>
              </tr>
            </thead>
            <tbody>
              {featuredModels.map((m) => (
                <tr key={`${m.name}-${m.vendor}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 16px" }}>
                    <strong>{m.display_name || m.name}</strong>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>{m.vendor}</div>
                  </td>
                  <td style={{ padding: "10px 16px" }}><span style={{ fontSize: 12, background: "#eff6ff", color: "#2563eb", borderRadius: 4, padding: "2px 8px" }}>{MODEL_CATEGORY_LABELS[m.category] ?? m.category}</span></td>
                  <td style={{ padding: "10px 16px", fontWeight: 600, color: "#2563eb" }}>{formatPrice(m.input_price)}</td>
                  <td style={{ padding: "10px 16px", fontWeight: 600, color: "#2563eb" }}>{formatPrice(m.output_price)}</td>
                  <td style={{ padding: "10px 16px", color: "#94a3b8" }}>{m.context_length > 0 ? m.context_length.toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ textAlign: "center", marginTop: 28 }}>
          <a href="/pricing" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>{t("home.pricing.viewAll")} →</a>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section style={{ background: "#f8fafc", padding: "80px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", fontSize: 30, fontWeight: 700, marginBottom: 48 }}>{t("home.faq.title")}</h2>
          {faqs.map((faq) => (
            <details key={faq.q} style={{ background: "#fff", borderRadius: 10, marginBottom: 12, padding: "20px 24px", border: "1px solid #e2e8f0" }}>
              <summary style={{ fontWeight: 600, fontSize: 16, cursor: "pointer", listStyle: "none" }}>
                <span style={{ marginRight: 8, color: "#2563eb" }}>Q:</span>{faq.q}
              </summary>
              <p style={{ marginTop: 12, color: "#475569", fontSize: 14, lineHeight: 1.8, paddingLeft: 8, borderLeft: "3px solid #2563eb" }}>{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section style={{ textAlign: "center", padding: "80px 24px", background: "linear-gradient(180deg, #eff6ff, #dbeafe)" }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>{t("home.cta.title")}</h2>
        <p style={{ color: "#475569", marginBottom: 28, fontSize: 16 }}>{t("home.cta.subtitle")}</p>
        <a href="/app/login" style={{ display: "inline-block", background: "#2563eb", color: "#fff", padding: "14px 40px", borderRadius: 8, textDecoration: "none", fontWeight: 600, fontSize: 16, boxShadow: "0 4px 14px rgba(37,99,235,.35)" }}>
          {t("home.cta.button")}
        </a>
      </section>
    </div>
  );
}
