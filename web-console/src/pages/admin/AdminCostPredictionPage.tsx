import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { HelpIcon, SkeletonGroup } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };

export default function AdminCostPredictionPage() {
  const [days, setDays] = useState(30);

  const predQ = useQuery({
    queryKey: ["admin-cost-prediction", days],
    queryFn: async () => (await api.get(`/admin/cost/prediction?days=${days}`)).data.data,
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>成本预测</h2>
        <HelpIcon text="cost_prediction" />
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "#666" }}>预测天数:</span>
        {[7, 15, 30, 60, 90].map(d => (
          <button key={d} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--color-border)",
            background: days === d ? "#4f6ef7" : "#fff", color: days === d ? "#fff" : "#333", cursor: "pointer", fontSize: 13 }}
            onClick={() => setDays(d)}>{d}天</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 20 }}>
        {[{ icon: "📦", label: "预测总成本", value: predQ.data?.summary?.predicted_total != null ? `¥${predQ.data.summary.predicted_total}` : "—" },
          { icon: "📊", label: "日均成本", value: predQ.data?.summary?.daily_avg != null ? `¥${predQ.data.summary.daily_avg}` : "—" },
          { icon: "🔮", label: "置信度", value: predQ.data?.summary?.confidence != null ? `${predQ.data.summary.confidence}%` : "—" },
          { icon: "⚠️", label: "风险级别", value: predQ.data?.summary?.risk_level ?? "—",
            color: predQ.data?.summary?.risk_level === "high" ? "#e53935" : predQ.data?.summary?.risk_level === "medium" ? "#f59e0b" : "#22c55e" },
        ].map((s, i) => (
          <div key={i} style={{ ...card, borderLeft: s.color ? `4px solid ${s.color}` : undefined }}>
            <div style={{ fontSize: 24 }}>{s.icon}</div>
            <div style={{ fontSize: 12, color: "#888", margin: "6px 0" }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>🔮 各供应商成本预测 <HelpIcon text="cost_prediction" /></div>
        {predQ.isLoading ? <SkeletonGroup lines={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>供应商</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>当前日均</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>预测日均</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>预测总成本</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>增长率</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>风险</th>
            </tr></thead>
            <tbody>
              {(predQ.data?.list ?? []).map((p: any) => (
                <tr key={p.vendor_name} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{p.vendor_name}</td>
                  <td style={{ padding: "10px 12px" }}>¥{p.current_daily_avg}</td>
                  <td style={{ padding: "10px 12px" }}>¥{p.predicted_daily_avg}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 600 }}>¥{p.predicted_total}</td>
                  <td style={{ padding: "10px 12px", color: p.growth_rate > 0 ? "#e53935" : "#22c55e" }}>
                    {p.growth_rate != null ? `${p.growth_rate > 0 ? "+" : ""}${p.growth_rate}%` : "—"}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 11,
                      background: p.risk === "high" ? "#fce4ec" : p.risk === "medium" ? "#fff8e1" : "#e8f5e9",
                      color: p.risk === "high" ? "#c62828" : p.risk === "medium" ? "#e65100" : "#2e7d32" }}>
                      {({ high: "高", medium: "中", low: "低" } as Record<string, string>)[p.risk] ?? "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
