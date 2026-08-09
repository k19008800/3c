// 模型目录 — 服务端组件（SSR）
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3030";

interface PublicModel {
  name: string;
  display_name: string | null;
  category: string | null;
  context_length: number | null;
  vendor: string;
  cost_input_price: string;
  cost_output_price: string;
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

export const metadata = {
  title: "3Cloud 模型目录",
  description: "3Cloud 接入的 AI 模型一览",
};

export default async function ModelsPage() {
  const models = await getModels();

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>模型目录</h1>
      <p style={{ color: "#64748b", marginBottom: 32 }}>共 {models.length} 个可用模型</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
        {models.map((m) => (
          <div key={m.name} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{m.display_name ?? m.name}</div>
            <code style={{ fontSize: 13, color: "#2563eb" }}>{m.name}</code>
            <div style={{ marginTop: 12, fontSize: 13, color: "#64748b" }}>
              供应商: {m.vendor}
              <br />
              上下文: {m.context_length ? `${m.context_length} tokens` : "-"}
              <br />
              分类: {m.category ?? "-"}
            </div>
          </div>
        ))}
      </div>
      {models.length === 0 && <p style={{ color: "#94a3b8" }}>暂无模型数据（请确认后端与 seed 状态）</p>}
    </div>
  );
}
