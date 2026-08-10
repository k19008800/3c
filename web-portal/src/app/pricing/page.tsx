// 定价页 — 使用公开标价 API（成本 × 加价率 = 对外标价）
import PriceCalculator from "./PriceCalculator";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

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

async function fetchPricing(): Promise<{ list: PriceItem[] }> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/pricing`, { cache: "no-store" });
    if (res.ok) return await res.json();
  } catch {}
  return { list: [] };
}

function formatPrice(p: number): string {
  if (p === 0) return "免费";
  if (p < 0.01) return `¥${p.toFixed(4)}`;
  if (p < 1) return `¥${p.toFixed(3)}`;
  return `¥${p.toFixed(2)}`;
}

const CATEGORY_LABELS: Record<string, string> = {
  chat: "对话", embedding: "嵌入", image: "图像", audio: "音频", video: "视频", rerank: "重排",
};

export const metadata = {
  title: "3Cloud 定价",
  description: "3Cloud 模型标价，透明计费、按量付费，动态拉取模型价格",
};

export default async function PricingPage() {
  const { list: models } = await fetchPricing();

  // 按分类分组
  const categories = Array.from(new Set(models.map((m) => m.category ?? "chat"))).sort();

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>模型标价</h1>
      <p style={{ color: "#64748b", marginBottom: 8, fontSize: 15 }}>
        透明计费 · 按量付费 · 无隐藏费用 · 实时拉取标价
      </p>

      <PriceCalculator models={models} />

      <h2 style={{ fontSize: 24, fontWeight: 700, margin: "48px 0 16px" }}>全部模型标价</h2>

      {/* 分类筛选 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        <span style={{ background: "#2563eb", color: "#fff", borderRadius: 20, padding: "6px 16px", fontSize: 13, fontWeight: 600 }}>
          全部 ({models.length})
        </span>
        {categories.map((cat) => (
          <span key={cat} style={{ background: "#f1f5f9", color: "#475569", borderRadius: 20, padding: "6px 16px", fontSize: 13 }}>
            {CATEGORY_LABELS[cat] ?? cat}
          </span>
        ))}
      </div>

      <div style={{ overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", fontSize: 14, minWidth: 700 }}>
          <thead>
            <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
              <th style={{ padding: "12px 16px" }}>模型名称</th>
              <th style={{ padding: "12px 16px" }}>供应商</th>
              <th style={{ padding: "12px 16px" }}>类别</th>
              <th style={{ padding: "12px 16px" }}>输入标价/1K tokens</th>
              <th style={{ padding: "12px 16px" }}>输出标价/1K tokens</th>
              <th style={{ padding: "12px 16px" }}>上下文长度</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={`${m.name}-${m.vendor}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "10px 16px" }}>
                  <strong>{m.display_name || m.name}</strong>
                  <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace" }}>{m.name}</div>
                </td>
                <td style={{ padding: "10px 16px", color: "#475569" }}>{m.vendor}</td>
                <td style={{ padding: "10px 16px" }}>
                  <span style={{ fontSize: 12, background: "#eff6ff", color: "#2563eb", borderRadius: 4, padding: "2px 8px" }}>
                    {CATEGORY_LABELS[m.category] ?? m.category}
                  </span>
                </td>
                <td style={{ padding: "10px 16px", fontWeight: 600, color: m.input_price === 0 ? "#16a34a" : "#2563eb" }}>
                  {formatPrice(m.input_price)}
                </td>
                <td style={{ padding: "10px 16px", fontWeight: 600, color: m.output_price === 0 ? "#16a34a" : "#2563eb" }}>
                  {formatPrice(m.output_price)}
                </td>
                <td style={{ padding: "10px 16px", color: "#94a3b8" }}>
                  {m.context_length > 0 ? m.context_length.toLocaleString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {models.length === 0 && (
        <p style={{ color: "#94a3b8", marginTop: 16, textAlign: "center", padding: 40 }}>
          暂无模型数据
        </p>
      )}

      {/* FAQ */}
      <div style={{ marginTop: 60 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>计费说明</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { q: "标价是什么意思？", a: "标价是 3Cloud 平台对外的标准售价，由后台为每个供应商-模型独立配置。这是用户折扣前的基准价，所有折扣均基于此价格独立计算。" },
            { q: "如何计费？", a: "按 Token 计费，输入和输出分别计价。您每调用一次 API，系统自动按照实际消耗的 Token 数量计算费用并从账户余额中扣除。" },
            { q: "有套餐吗？", a: "按量计费，用多少付多少。如需更高额度或专属折扣，可联系销售获取企业定制方案。" },
            { q: "有免费额度吗？", a: "新用户注册后实名认证即送 ¥5 试用额度，可以充分体验平台各模型能力。" },
            { q: "价格会变吗？", a: "供应商成本价变动时，标价会自动调整。平台标价为实时拉取，确保定价透明。" },
          ].map((faq) => (
            <details key={faq.q} style={{ background: "#fff", borderRadius: 10, padding: "16px 20px", border: "1px solid #e2e8f0" }}>
              <summary style={{ fontWeight: 600, fontSize: 15, cursor: "pointer", listStyle: "none" }}>Q: {faq.q}</summary>
              <p style={{ marginTop: 10, color: "#475569", fontSize: 14, lineHeight: 1.8, paddingLeft: 8, borderLeft: "3px solid #2563eb" }}>{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
