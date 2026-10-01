import type { Metadata } from "next";
import type { ReactNode } from "react";
import { fetchDictionary, makeT, resolveLang, siteAlternates } from "../lib/i18n";
import { getCookieLang } from "../lib/i18n-server";
import { PageHelp } from "../components/Help";

export const dynamic = "force-dynamic";

const API_BASE = "http://127.0.0.1:3000";

// ===== 类型 =====
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
  } catch {
    // Use the built-in API endpoints when the optional public configuration is unavailable.
  }
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
  } catch {
    // Render the page with zeroed statistics when the public stats endpoint is unavailable.
  }
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
  } catch {
    // Render the page without pricing cards when the public pricing endpoint is unavailable.
  }
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

// ===== 品牌母题：线性 SVG 图标（替代 emoji） =====
function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const FEATURE_ICONS: Record<string, ReactNode> = {
  unified: (
    <Glyph>
      <path d="M10 14a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
      <path d="M14 10a5 5 0 0 0-7.07 0L4.1 12.83a5 5 0 0 0 7.07 7.07l1.5-1.5" />
    </Glyph>
  ),
  routing: (
    <Glyph>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2.1 4.9-4.9 2.1 2.1-4.9z" />
    </Glyph>
  ),
  billing: (
    <Glyph>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M21 20H3" />
    </Glyph>
  ),
  vendors: (
    <Glyph>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h6" />
    </Glyph>
  ),
  security: (
    <Glyph>
      <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z" />
      <path d="M9.5 12l2 2 3.5-3.5" />
    </Glyph>
  ),
  multidevice: (
    <Glyph>
      <rect x="2" y="5" width="14" height="10" rx="1.5" />
      <path d="M6 19h6" />
      <rect x="17" y="9" width="5" height="10" rx="1.2" />
    </Glyph>
  ),
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

  const [stats, pricing, apiConfig] = await Promise.all([
    fetchStats(),
    fetchPricing(),
    fetchApiConfig(),
  ]);

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
    { iconKey: "unified", title: t("home.features.unified.title"), desc: t("home.features.unified.desc") },
    { iconKey: "routing", title: t("home.features.routing.title"), desc: t("home.features.routing.desc") },
    { iconKey: "billing", title: t("home.features.billing.title"), desc: t("home.features.billing.desc") },
    { iconKey: "vendors", title: t("home.features.vendors.title"), desc: t("home.features.vendors.desc") },
    { iconKey: "security", title: t("home.features.security.title"), desc: t("home.features.security.desc") },
    { iconKey: "multidevice", title: t("home.features.multidevice.title"), desc: t("home.features.multidevice.desc") },
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

  const statsCells = [
    { label: t("home.stats.models"), value: String(stats.models ?? 0) },
    { label: t("home.stats.vendors"), value: String(stats.vendors ?? 0) },
    { label: t("home.stats.users"), value: String(stats.users ?? 0) },
    { label: t("home.stats.tokens"), value: formatTokens(stats.totalTokens ?? 0) },
  ];

  return (
    <div>
      {/* ===== Hero：编辑排版式 ===== */}
      <section className="hero">
        <div className="container">
          <div className="hero-grid">
            <div className="anim-fade-in">
              <span className="overline">AI API Aggregation Platform</span>
              <h1 className="hero-title">
                {t("home.hero.title")}
                <PageHelp text={t("help.home")} />
              </h1>
              <p className="hero-subtitle">{t("home.hero.subtitle")}</p>
              <div className="hero-actions">
                <a href="/models" className="btn btn-primary btn-lg">{t("home.hero.browseModels")}</a>
                <a href="/pricing" className="btn btn-secondary btn-lg">{t("home.hero.viewPricing")}</a>
                <a href="/app/login" className="btn btn-ghost btn-lg">{t("home.hero.signup")}</a>
              </div>
            </div>

            {/* Hero 右侧：实时接入终端 */}
            <div className="hero-visual anim-fade-in">
              <div className="terminal-card">
                <div className="terminal-bar">
                  <span className="terminal-dot" />
                  <span className="terminal-dot" />
                  <span className="terminal-dot primary" />
                  <span className="terminal-title">$ {t("home.hero.quickstart")}</span>
                </div>
                <div className="terminal-body">
                  <div><span className="tok-cmt">$</span> <span className="tok-cmd">curl</span> {apiConfig.openaiChatUrl} \</div>
                  <div>&nbsp;&nbsp;-H <span className="tok-str">"Authorization: Bearer YOUR_API_KEY"</span> \</div>
                  <div>&nbsp;&nbsp;-H <span className="tok-str">"Content-Type: application/json"</span> \</div>
                  <div>&nbsp;&nbsp;-d <span className="tok-str">'{`{"model":"deepseek-chat","messages":[{"role":"user","content":"你好"}]}`}'</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 统计带 ===== */}
      <section className="stats-band container">
        <div className="stats-grid">
          {statsCells.map((s, i) => (
            <div key={s.label} className={`stat-cell anim-fade-in-up anim-fade-in-up-d${i + 1}`}>
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 特性区 ===== */}
      <section className="section container">
        <div className="section-head">
          <h2 className="section-title">{t("home.features.title")}</h2>
          <p className="section-subtitle">{t("home.features.subtitle")}</p>
        </div>
        <div className="feature-grid">
          {features.map((f, i) => (
            <div key={f.title} className={`feature-card anim-fade-in-up anim-fade-in-up-d${(i % 4) + 1}`}>
              <div className="feature-icon">{FEATURE_ICONS[f.iconKey]}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 模型目录 ===== */}
      <section className="band-gray section">
        <div className="container">
          <div className="section-head">
            <h2 className="section-title">{t("home.popular.title")}</h2>
            <p className="section-subtitle">{t("home.popular.subtitle")}</p>
          </div>

          {modelsByCategory.size > 0 && (
            <div className="cat-pills">
              {Array.from(modelsByCategory.keys()).map((cat) => (
                <span key={cat} className="cat-pill">
                  {MODEL_CATEGORY_LABELS[cat] ?? cat}
                </span>
              ))}
            </div>
          )}

          <div className="model-grid">
            {pricing.pricing.slice(0, 12).map((m) => (
              <div key={`${m.name}-${m.vendor}`} className="model-card">
                <div className="model-card-head">
                  <strong className="model-name">{m.display_name || m.name}</strong>
                  <span className="model-tag">{MODEL_CATEGORY_LABELS[m.category] ?? m.category}</span>
                </div>
                <div className="model-code">{m.name}</div>
                <div className="model-price-row">
                  <div className="price-item">
                    <div className="price-cap">{t("home.pricing.input")}</div>
                    <div className="price-num">{formatPrice(m.input_price)}</div>
                  </div>
                  <div className="price-item">
                    <div className="price-cap">{t("home.pricing.output")}</div>
                    <div className="price-num">{formatPrice(m.output_price)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ textAlign: "center", marginTop: "var(--space-3xl)" }}>
            <a href="/models" className="text-link">
              {t("home.popular.viewAll")} ({pricing.pricing.length}+) →
            </a>
          </div>
        </div>
      </section>

      {/* ===== 接入步骤 ===== */}
      <section className="section container">
        <div className="section-head">
          <h2 className="section-title">{t("home.how.title")}</h2>
          <p className="section-subtitle">{t("home.how.subtitle")}</p>
        </div>
        <div className="steps-grid">
          {steps.map((s) => (
            <div key={s.step} className="step-card">
              <div className="step-num">{s.step}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 暗色开发者区 ===== */}
      <section className="band-dark section">
        <div className="container">
          <div className="section-head">
            <h2 className="section-title">{t("home.dev.title")}</h2>
            <p className="section-subtitle">{t("home.dev.subtitle")}</p>
          </div>

          <div className="dev-tabs">
            {["cURL", "Python", "JavaScript"].map((langName, idx) => (
              <span key={langName} className={`dev-tab${idx === 0 ? " active" : ""}`}>
                {langName}
              </span>
            ))}
          </div>

          <div className="code-window">
            <div className="cmt"># Python · OpenAI SDK（base_url = {apiConfig.openaiBaseUrl}）</div>
            <div><span className="cmt">from</span> openai <span className="cmt">import</span> <span className="fn">OpenAI</span></div>
            <div style={{ marginTop: 8 }}><span className="fn">client</span> = OpenAI(</div>
            <div>&nbsp;&nbsp;api_key=<span className="str">"YOUR_API_KEY"</span>,</div>
            <div>&nbsp;&nbsp;base_url=<span className="str">"{apiConfig.openaiBaseUrl}"</span></div>
            <div>)</div>
            <div style={{ marginTop: 8 }}><span className="fn">response</span> = client.chat.completions.create(</div>
            <div>&nbsp;&nbsp;model=<span className="str">"deepseek-chat"</span>,</div>
            <div>&nbsp;&nbsp;messages=[{`{"role": "user", "content": "你好"}`}]</div>
            <div>)</div>
            <div style={{ marginTop: 8 }}><span className="cmt">print</span>(response.choices[0].message.content)</div>
            <div className="cmt" style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 12 }}>
              # Anthropic SDK（base_url = {apiConfig.anthropicBaseUrl}，支持 tool_use / 流式）
            </div>
            <div><span className="cmt">from</span> anthropic <span className="cmt">import</span> <span className="fn">Anthropic</span></div>
            <div><span className="fn">client</span> = Anthropic(base_url=<span className="str">"{apiConfig.anthropicBaseUrl}"</span>, api_key=<span className="str">"YOUR_API_KEY"</span>)</div>
          </div>
        </div>
      </section>

      {/* ===== 价格表 ===== */}
      <section className="section container">
        <div className="section-head">
          <h2 className="section-title">{t("home.pricing.title")}</h2>
          <p className="section-subtitle">{t("home.pricing.subtitle")}</p>
        </div>

        <div className="price-table-wrap">
          <table className="price-table">
            <thead>
              <tr>
                <th>{t("home.pricing.model")}</th>
                <th>{t("home.pricing.category")}</th>
                <th>{t("home.pricing.input")}</th>
                <th>{t("home.pricing.output")}</th>
                <th>{t("home.pricing.context")}</th>
              </tr>
            </thead>
            <tbody>
              {featuredModels.map((m) => (
                <tr key={`${m.name}-${m.vendor}`}>
                  <td className="cell-model">
                    <strong>{m.display_name || m.name}</strong>
                    <span className="cell-vendor">{m.vendor}</span>
                  </td>
                  <td><span className="price-tag">{MODEL_CATEGORY_LABELS[m.category] ?? m.category}</span></td>
                  <td className="price-num">{formatPrice(m.input_price)}</td>
                  <td className="price-num">{formatPrice(m.output_price)}</td>
                  <td>{m.context_length > 0 ? m.context_length.toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ textAlign: "center", marginTop: "var(--space-2xl)" }}>
          <a href="/pricing" className="text-link">{t("home.pricing.viewAll")} →</a>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section className="band-gray section">
        <div className="container">
          <div className="section-head">
            <h2 className="section-title">{t("home.faq.title")}</h2>
          </div>
          <div className="faq-list">
            {faqs.map((faq) => (
              <details key={faq.q} className="faq-item">
                <summary>
                  <span className="q-mark">Q</span>
                  {faq.q}
                </summary>
                <p className="faq-answer">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="cta-band">
        <h2>{t("home.cta.title")}</h2>
        <p>{t("home.cta.subtitle")}</p>
        <a href="/app/login" className="btn btn-primary btn-lg">{t("home.cta.button")}</a>
      </section>
    </div>
  );
}
