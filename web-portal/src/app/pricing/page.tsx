// 定价页 — 服务端拉模型价 + 客户端价格计算器
import PriceCalculator from "./PriceCalculator";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

interface ModelPrice {
  name: string;
  display_name: string | null;
  vendor: string;
  cost_input_price: string;
  cost_output_price: string;
}

async function getModels(): Promise<ModelPrice[]> {
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
  title: "3Cloud 定价",
  description: "3Cloud 模型定价，透明计费、按量付费",
};

export default async function PricingPage() {
  const models = await getModels();

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>定价</h1>
      <p style={{ color: "#64748b", marginBottom: 32 }}>透明计费 · 按量付费 · 无隐藏费用（价格为示范成本价×加成，实际以合同为准）</p>

      <PriceCalculator models={models} />

      <h2 style={{ fontSize: 24, margin: "48px 0 16px" }}>模型单价</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
        <thead>
          <tr style={{ background: "#f8fafc", textAlign: "left" }}>
            <th style={{ padding: 12 }}>模型</th>
            <th style={{ padding: 12 }}>供应商</th>
            <th style={{ padding: 12 }}>输入/1K</th>
            <th style={{ padding: 12 }}>输出/1K</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.name} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: 12 }}>
                <strong>{m.display_name ?? m.name}</strong>
                <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace" }}>{m.name}</div>
              </td>
              <td style={{ padding: 12 }}>{m.vendor}</td>
              <td style={{ padding: 12 }}>¥{Number(m.cost_input_price).toFixed(4)}</td>
              <td style={{ padding: 12 }}>¥{Number(m.cost_output_price).toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {models.length === 0 && <p style={{ color: "#94a3b8", marginTop: 12 }}>暂无模型数据</p>}
    </div>
  );
}
