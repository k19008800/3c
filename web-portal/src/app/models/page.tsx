// 模型目录 — 服务端组件（SSR）
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

interface PublicModel {
  name: string;
  display_name: string | null;
  category: string | null;
  context_length: number | null;
  vendor: string;
  cost_input_price: string;
  cost_output_price: string;
}

interface PublicModelHealth {
  model: string;
  success_rate: number | null;
  p50_ms: number;
  status: "healthy" | "degraded" | "unavailable" | "no_data";
  min_price: number | null;
}

async function getModels(): Promise<PublicModel[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/models`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      return data.list ?? [];
    }
  } catch {
    /* 兜底 */
  }
  return [];
}

/** 拉取最近 24h 的模型健康度（免鉴权，仅暴露健康/价格） */
async function getModelHealth(): Promise<Map<string, PublicModelHealth>> {
  const map = new Map<string, PublicModelHealth>();
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/models/health?window=1h`, { cache: "no-store" });
    if (res.ok) {
      const body = await res.json();
      const items: PublicModelHealth[] = body.data?.items ?? [];
      for (const it of items) map.set(it.model, it);
    }
  } catch {
    /* 兜底 */
  }
  return map;
}

const STATUS_META: Record<PublicModelHealth["status"], { text: string; color: string; bg: string }> = {
  healthy: { text: "健康", color: "#15803d", bg: "#dcfce7" },
  degraded: { text: "降级", color: "#b45309", bg: "#fef3c7" },
  unavailable: { text: "异常", color: "#b91c1c", bg: "#fee2e2" },
  no_data: { text: "暂无数据", color: "#64748b", bg: "#f1f5f9" },
};

export const metadata = {
  title: "3Cloud 模型目录",
  description: "3Cloud 接入的 AI 模型一览",
  openGraph: {
    title: "3Cloud 模型目录",
    description: "3Cloud 接入的 AI 模型一览",
    type: "website",
  },
};

export default async function ModelsPage() {
  const [models, health] = await Promise.all([getModels(), getModelHealth()]);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>模型目录</h1>
      <p style={{ color: "#64748b", marginBottom: 32 }}>共 {models.length} 个可用模型</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
        {models.map((m) => {
          const h = health.get(m.name);
          const meta = h ? STATUS_META[h.status] : null;
          return (
            <div key={m.name} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{m.display_name ?? m.name}</div>
                {meta && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: meta.color, background: meta.bg, padding: "2px 10px", borderRadius: 999 }}>
                    {meta.text}
                  </span>
                )}
              </div>
              <code style={{ fontSize: 13, color: "#2563eb" }}>{m.name}</code>
              <div style={{ marginTop: 12, fontSize: 13, color: "#64748b" }}>
                供应商: {m.vendor}
                <br />
                上下文: {m.context_length ? `${m.context_length} tokens` : "-"}
                <br />
                分类: {m.category ?? "-"}
                <br />
                {h && h.min_price != null ? (
                  <>
                    P50 延迟: {h.p50_ms > 0 ? `${h.p50_ms}ms` : "-"}
                    <br />
                    <span style={{ color: "#15803d", fontWeight: 600 }}>最低价: ¥{h.min_price} / 1M tokens</span>
                  </>
                ) : (
                  <>价格: ¥{m.cost_input_price} / ¥{m.cost_output_price}</>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {models.length === 0 && <p style={{ color: "#94a3b8" }}>暂无模型数据（请确认后端与 seed 状态）</p>}
    </div>
  );
}
