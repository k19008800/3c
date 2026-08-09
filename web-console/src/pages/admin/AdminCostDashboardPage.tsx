import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { HelpIcon, SkeletonGroup } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };

export default function AdminCostDashboardPage() {
  const [period, setPeriod] = useState("month");

  const costQ = useQuery({
    queryKey: ["admin-cost-dashboard", period],
    queryFn: async () => (await api.get(`/admin/cost/dashboard?period=${period}`)).data.data,
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>成本看板</h2>
        <HelpIcon text="cost_dashboard" />
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
        {["week", "month", "quarter"].map(p => (
          <button key={p} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--color-border)",
            background: period === p ? "#4f6ef7" : "#fff", color: period === p ? "#fff" : "#333", cursor: "pointer", fontSize: 13 }}
            onClick={() => setPeriod(p)}>
            {{ week: "本周", month: "本月", quarter: "本季" }[p]}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 20 }}>
        {[{ icon: "📦", label: "总成本", value: costQ.data?.summary?.total_cost != null ? `¥${costQ.data.summary.total_cost}` : "—" },
          { icon: "📊", label: "环比变化", value: costQ.data?.summary?.cost_change != null ? `${costQ.data.summary.cost_change > 0 ? "+" : ""}${costQ.data.summary.cost_change}%` : "—",
            color: costQ.data?.summary?.cost_change > 0 ? "#e53935" : "#22c55e" },
          { icon: "🏆", label: "成本最高", value: costQ.data?.summary?.top_cost_vendor ?? "—" },
          { icon: "⚠️", label: "成本异常", value: costQ.data?.summary?.cost_anomalies ?? "—", color: "#e53935" },
        ].map((s, i) => (
          <div key={i} style={card}>
            <div style={{ fontSize: 24 }}>{s.icon}</div>
            <div style={{ fontSize: 12, color: "#888", margin: "6px 0" }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>📉 各供应商成本占比 <HelpIcon text="cost_dashboard" /></div>
        {costQ.isLoading ? <SkeletonGroup lines={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>供应商</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>成本金额</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>占比</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>调用量</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>环比</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>趋势</th>
            </tr></thead>
            <tbody>
              {(costQ.data?.list ?? []).map((c: any) => (
                <tr key={c.vendor_name} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{c.vendor_name}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 600 }}>¥{c.cost}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 8, background: "#f0f0f0", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${c.percentage}%`, background: "#4f6ef7", borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 11, minWidth: 35 }}>{c.percentage}%</span>
                    </div>
                  </td>
                  <td style={{ padding: "10px 12px" }}>{c.call_count?.toLocaleString()}</td>
                  <td style={{ padding: "10px 12px", color: c.change > 0 ? "#e53935" : "#22c55e" }}>
                    {c.change != null ? `${c.change > 0 ? "+" : ""}${c.change}%` : "—"}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {c.trend === "up" ? "📈" : c.trend === "down" ? "📉" : "➡️"}
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
