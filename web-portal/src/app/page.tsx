import type { Metadata } from "next";

export const dynamic = "force-dynamic";

const API_BASE = "http://127.0.0.1:3030";

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

export const metadata: Metadata = {
  title: "3Cloud — 一站式 AI API 聚合平台",
  description: "统一接入 DeepSeek、Qwen、GLM、GPT、Claude 等主流模型，智能路由、统一计费、精细运营，一套 API 搞定全部模型",
  openGraph: {
    title: "3Cloud — 一站式 AI API 聚合平台",
    description: "统一计费、智能路由、精细运营",
    type: "website",
  },
};

// ===== 首页 =====
export default async function HomePage() {
  const [config, stats, pricing] = await Promise.all([
    fetchSiteConfig(),
    fetchStats(),
    fetchPricing(),
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
            一站式 AI API 聚合平台
          </h1>
          <p style={{ fontSize: 18, color: "#475569", maxWidth: 640, margin: "0 auto 36px", lineHeight: 1.7 }}>
            统一接入 <strong>DeepSeek、Qwen、GLM、GPT、Claude</strong> 等{config.site_name ?? "3Cloud"}模型，智能路由、统一计费、精细运营 — 一套 API 搞定全部模型
          </p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="/models" style={{ background: "#2563eb", color: "#fff", padding: "14px 32px", borderRadius: 8, textDecoration: "none", fontWeight: 600, fontSize: 16, boxShadow: "0 4px 14px rgba(37,99,235,.35)" }}>
              浏览模型目录
            </a>
            <a href="/pricing" style={{ border: "1px solid #cbd5e1", color: "#0f172a", background: "#fff", padding: "14px 32px", borderRadius: 8, textDecoration: "none", fontWeight: 600, fontSize: 16 }}>
              查看定价
            </a>
            <a href="/app/login" style={{ border: "1px solid #cbd5e1", color: "#475569", padding: "14px 32px", borderRadius: 8, textDecoration: "none" }}>
              注册 / 登录
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
            <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 8 }}>$ 一键接入</div>
            <div><span style={{ color: "#60a5fa" }}>curl</span> https://api.unmisa.com/api/v1<span style={{ color: "#fbbf24" }}>/chat/completions</span> \</div>
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
            { label: "接入模型", value: String(stats.models ?? 0), icon: "🧩" },
            { label: "供应商", value: String(stats.vendors ?? 0), icon: "🏭" },
            { label: "平台用户", value: String(stats.users ?? 0), icon: "👥" },
            { label: "累计 Tokens", value: formatTokens(stats.totalTokens ?? 0), icon: "⚡" },
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
        <h2 style={{ textAlign: "center", fontSize: 30, fontWeight: 700, marginBottom: 12 }}>为什么选择 {siteName}</h2>
        <p style={{ textAlign: "center", color: "#64748b", marginBottom: 48, fontSize: 16 }}>一站接入，覆盖全场景 AI 能力</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
          {[
            { icon: "🔗", title: "统一接入", desc: "一套 API Key 接入多家供应商的 200+ 模型，兼容 OpenAI API 格式，零代码迁移" },
            { icon: "🧭", title: "智能路由", desc: "自动选择最优供应商，支持多通道灾备熔断，故障自动切换，保障高可用" },
            { icon: "📊", title: "统一计费", desc: "精确到 Token 级别的实时计费，一套账单看清所有模型消费，支持余额预警" },
            { icon: "🏢", title: "多供应商", desc: "对接 DeepSeek、OpenAI、Anthropic、Google、智谱等全球主流 AI 供应商" },
            { icon: "🔐", title: "安全合规", desc: "支持 IP 白名单、用量限额、操作审计、数据加密传输，满足企业级安全需求" },
            { icon: "📱", title: "多端支持", desc: "Web 管理后台 + API 接口 + 代理运营面板，覆盖开发/运营/管理全场景" },
          ].map((f, i) => (
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
          <h2 style={{ textAlign: "center", fontSize: 30, fontWeight: 700, marginBottom: 12 }}>热门模型</h2>
          <p style={{ textAlign: "center", color: "#64748b", marginBottom: 40, fontSize: 16 }}>覆盖对话、嵌入、图像、音频等多种能力</p>

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
                  <div><span style={{ fontSize: 11, color: "#94a3b8" }}>输入 </span><span style={{ fontWeight: 600, color: "#2563eb" }}>{formatPrice(m.input_price)}</span><span style={{ fontSize: 11, color: "#94a3b8" }}>/1K</span></div>
                  <div><span style={{ fontSize: 11, color: "#94a3b8" }}>输出 </span><span style={{ fontWeight: 600, color: "#2563eb" }}>{formatPrice(m.output_price)}</span><span style={{ fontSize: 11, color: "#94a3b8" }}>/1K</span></div>
                </div>
                {m.context_length > 0 && <div style={{ fontSize: 11, color: "#94a3b8" }}>上下文 {m.context_length.toLocaleString()} tokens</div>}
              </div>
            ))}
          </div>

          <div style={{ textAlign: "center", marginTop: 32 }}>
            <a href="/models" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600, fontSize: 15 }}>
              查看全部模型 ({pricing.pricing.length}+) →
            </a>
          </div>
        </div>
      </section>

      {/* ===== How It Works ===== */}
      <section style={{ maxWidth: 1000, margin: "80px auto", padding: "0 24px" }}>
        <h2 style={{ textAlign: "center", fontSize: 30, fontWeight: 700, marginBottom: 12 }}>三步开始调用</h2>
        <p style={{ textAlign: "center", color: "#64748b", marginBottom: 48, fontSize: 16 }}>从注册到首次调用，不到 3 分钟</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 32 }}>
          {[
            { step: "01", title: "注册账号", desc: "使用邮箱注册，通过实名认证即可获得 ¥5 试用额度，立即开始体验" },
            { step: "02", title: "创建 API Key", desc: "在控制台创建 API Key，设置权限、用量限额和安全策略" },
            { step: "03", title: "调用模型", desc: "使用 OpenAI 兼容接口调用，支持 cURL / Python / Node.js 等多种语言" },
          ].map((s) => (
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
          <h2 style={{ textAlign: "center", fontSize: 30, fontWeight: 700, marginBottom: 12 }}>开发者友好</h2>
          <p style={{ textAlign: "center", color: "#94a3b8", marginBottom: 40, fontSize: 16 }}>兼容 OpenAI SDK，几行代码即可接入</p>

          {/* 语言切换标签 */}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 24 }}>
            {["cURL", "Python", "JavaScript"].map((lang) => (
              <span key={lang} style={{ background: lang === "cURL" ? "#2563eb" : "transparent", border: lang === "cURL" ? "none" : "1px solid #334155", borderRadius: 6, padding: "6px 18px", fontSize: 13, color: "#fff", cursor: "default" }}>
                {lang}
              </span>
            ))}
          </div>

          {/* 代码块 */}
          <div style={{ background: "#1e293b", borderRadius: 10, padding: "24px 28px", fontFamily: "Consolas, Monaco, 'Courier New', monospace", fontSize: 13, lineHeight: 1.8, overflow: "auto" }}>
            <div style={{ color: "#64748b", marginBottom: 4 }}># Python</div>
            <div><span style={{ color: "#fbbf24" }}>from</span> openai <span style={{ color: "#fbbf24" }}>import</span> <span style={{ color: "#60a5fa" }}>OpenAI</span></div>
            <div style={{ marginTop: 8 }}><span style={{ color: "#60a5fa" }}>client</span> = OpenAI(</div>
            <div>&nbsp;&nbsp;api_key=<span style={{ color: "#34d399" }}>"YOUR_API_KEY"</span>,</div>
            <div>&nbsp;&nbsp;base_url=<span style={{ color: "#34d399" }}>"https://api.unmisa.com/api/v1"</span></div>
            <div>)</div>
            <div style={{ marginTop: 8 }}><span style={{ color: "#60a5fa" }}>response</span> = client.chat.completions.create(</div>
            <div>&nbsp;&nbsp;model=<span style={{ color: "#34d399" }}>"deepseek-chat"</span>,</div>
            <div>&nbsp;&nbsp;messages=[{`{"role": "user", "content": "你好"}`}]</div>
            <div>)</div>
            <div style={{ marginTop: 8 }}><span style={{ color: "#fbbf24" }}>print</span>(response.choices[0].message.content)</div>
          </div>
        </div>
      </section>

      {/* ===== Pricing Preview ===== */}
      <section style={{ maxWidth: 1000, margin: "80px auto", padding: "0 24px" }}>
        <h2 style={{ textAlign: "center", fontSize: 30, fontWeight: 700, marginBottom: 12 }}>透明定价</h2>
        <p style={{ textAlign: "center", color: "#64748b", marginBottom: 8, fontSize: 16 }}>
          按量计费，用多少付多少，无隐藏费用
        </p>

        <div style={{ overflow: "auto", marginTop: 32 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", fontSize: 14, minWidth: 600 }}>
            <thead>
              <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                <th style={{ padding: "12px 16px" }}>模型</th>
                <th style={{ padding: "12px 16px" }}>类别</th>
                <th style={{ padding: "12px 16px" }}>输入/1K tokens</th>
                <th style={{ padding: "12px 16px" }}>输出/1K tokens</th>
                <th style={{ padding: "12px 16px" }}>上下文</th>
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
          <a href="/pricing" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>查看完整定价 →</a>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section style={{ background: "#f8fafc", padding: "80px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", fontSize: 30, fontWeight: 700, marginBottom: 48 }}>常见问题</h2>
          {[
            { q: "什么是 3Cloud？", a: "3Cloud 是一个 AI API 聚合平台，提供统一的 API 接口接入多家供应商的 AI 模型（如 DeepSeek、OpenAI、Anthropic、Google 等），让开发者只需一套 API Key 就能调用所有模型。" },
            { q: "如何计费？", a: "按 Token 计费，输入和输出分别计价。不同模型价格不同，用多少付多少，无月费无最低消费。具体每个模型的标价请查看定价页面。" },
            { q: "支持哪些模型？", a: "我们支持对话（Chat）、嵌入（Embedding）、图像（Image）、音频（Audio）、视频（Video）等多种类别的模型，覆盖 DeepSeek、Qwen、GLM、GPT、Claude、Gemini 等主流供应商。" },
            { q: "怎么开始使用？", a: "注册账号 → 实名认证 → 创建 API Key → 使用 OpenAI 兼容接口调用。新用户注册即送 ¥5 试用额度。详细文档请查看开发者文档。" },
            { q: "是否兼容 OpenAI SDK？", a: `完全兼容。只需将 SDK 的 base_url 指向 ${API_BASE.includes("localhost") ? "https://api.unmisa.com" : API_BASE}/api/v1，搭配 3Cloud API Key 即可使用。` },
            { q: "供应商故障时怎么办？", a: "3Cloud 的智能路由引擎会自动检测供应商健康状态，当某个供应商异常时自动切换到其他可用供应商，保障服务的高可用性。" },
            { q: "企业用户有优惠吗？", a: "有。企业用户可以联系销售获取专属折扣方案、定制化定价和优先技术支持。请联系 {config.site_contact_email ?? 'support@unmisa.com'}。" },
          ].map((faq) => (
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
        <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>准备好开始了吗？</h2>
        <p style={{ color: "#475569", marginBottom: 28, fontSize: 16 }}>注册即送 ¥5 试用额度，立刻体验</p>
        <a href="/app/login" style={{ display: "inline-block", background: "#2563eb", color: "#fff", padding: "14px 40px", borderRadius: 8, textDecoration: "none", fontWeight: 600, fontSize: 16, boxShadow: "0 4px 14px rgba(37,99,235,.35)" }}>
          免费注册
        </a>
      </section>
    </div>
  );
}
