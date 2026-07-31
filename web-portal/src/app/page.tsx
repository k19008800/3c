// 首页 — 服务端组件（SSR），SEO 友好
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

interface Stats {
  models: number;
  vendors: number;
  users: number;
  totalTokens: number;
}

async function getStats(): Promise<Stats> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/stats`, { cache: "no-store" });
    if (res.ok) return await res.json();
  } catch {
    /* 后端不可用走兜底 */
  }
  return { models: 0, vendors: 0, users: 0, totalTokens: 0 };
}

export const metadata = {
  title: "3Cloud — 一站式 AI API 聚合平台",
  description: "接入 DeepSeek、Qwen、GLM 等主流模型，统一计费、智能路由、精细运营",
};

export default async function HomePage() {
  const stats = await getStats();

  return (
    <div>
      {/* Hero */}
      <section style={{ textAlign: "center", padding: "80px 24px", background: "linear-gradient(180deg,#eff6ff,#fff)" }}>
        <h1 style={{ fontSize: 44, fontWeight: 800, maxWidth: 720, margin: "0 auto 20px" }}>
          一站式 AI API 聚合平台
        </h1>
        <p style={{ fontSize: 18, color: "#475569", maxWidth: 560, margin: "0 auto 32px" }}>
          统一接入 DeepSeek、Qwen、GLM 等主流模型，智能路由、统一计费、精细运营，一套 API 搞定全部模型
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
          <a
            href="/models"
            style={{ background: "#2563eb", color: "#fff", padding: "12px 28px", borderRadius: 8, textDecoration: "none", fontWeight: 600 }}
          >
            浏览模型
          </a>
          <a
            href="/pricing"
            style={{ border: "1px solid #cbd5e1", color: "#0f172a", padding: "12px 28px", borderRadius: 8, textDecoration: "none" }}
          >
            查看定价
          </a>
        </div>
      </section>

      {/* 统计横幅 */}
      <section style={{ maxWidth: 960, margin: "-20px auto 0", padding: "0 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 16 }}>
        {[
          { label: "接入模型", value: String(stats.models ?? 0) },
          { label: "供应商", value: String(stats.vendors ?? 0) },
          { label: "平台用户", value: String(stats.users ?? 0) },
          { label: "累计 Tokens", value: formatTokens(stats.totalTokens ?? 0) },
        ].map((s) => (
          <div key={s.label} style={{ background: "#fff", borderRadius: 12, padding: 24, textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,.06)" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#2563eb" }}>{s.value}</div>
            <div style={{ fontSize: 14, color: "#64748b", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </section>

      {/* 特性 */}
      <section style={{ maxWidth: 960, margin: "60px auto", padding: "0 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 24 }}>
          {[
            { t: "智能路由", d: "多供应商自动 failover，负载均衡、熔断保护，保障高可用" },
            { t: "统一计费", d: "一套账单看清所有模型消费，精确到 token 与费用" },
            { t: "精细运营", d: "用户/代理/供应商全链路管理，实时监控与告警" },
          ].map((f) => (
            <div key={f.t} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 24 }}>
              <h3 style={{ marginBottom: 8 }}>{f.t}</h3>
              <p style={{ color: "#475569" }}>{f.d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function formatTokens(t: number): string {
  if (t >= 1_0000_0000) return `${(t / 1_0000_0000).toFixed(1)}亿`;
  if (t >= 1_0000) return `${(t / 1_0000).toFixed(0)}万`;
  return String(t);
}
