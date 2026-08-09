import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { HelpIcon, SkeletonGroup } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };

export default function AdminProfitPage() {
  const [period, setPeriod] = useState("month");

  const profitQ = useQuery({
    queryKey: ["admin-profit", period],
    queryFn: async () => (await api.get(`/admin/profit?period=${period}`)).data.data,
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>利润分析</h2>
        <HelpIcon text="profit" />
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
        {["week", "month", "quarter", "year"].map(p => (
          <button key={p} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--color-border)",
            background: period === p ? "#4f6ef7" : "#fff", color: period === p ? "#fff" : "#333", cursor: "pointer", fontSize: 13 }}
            onClick={() => setPeriod(p)}>
            {{ week: "本周", month: "本月", quarter: "本季", year: "本年" }[p]}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 20 }}>
        {[{ icon: "💰", label: "总收入", value: profitQ.data?.summary?.revenue != null ? `¥${profitQ.data.summary.revenue}` : "—" },
          { icon: "📦", label: "总成本", value: profitQ.data?.summary?.cost != null ? `¥${profitQ.data.summary.cost}` : "—" },
          { icon: "📈", label: "净利润", value: profitQ.data?.summary?.profit != null ? `¥${profitQ.data.summary.profit}` : "—", color: profitQ.data?.summary?.profit >= 0 ? "#22c55e" : "#e53935" },
          { icon: "📊", label: "毛利率", value: profitQ.data?.summary?.margin != null ? `${profitQ.data.summary.margin}%` : "—" },
        ].map((s, i) => (
          <div key={i} style={card}>
            <div style={{ fontSize: 24 }}>{s.icon}</div>
            <div style={{ fontSize: 12, color: "#888", margin: "6px 0" }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>📈 利润明细 <HelpIcon text="profit" /></div>
        {profitQ.isLoading ? <SkeletonGroup lines={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>供应商</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>收入</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>成本</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>佣金</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>净利润</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>毛利率</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>趋势</th>
            </tr></thead>
            <tbody>
              {(profitQ.data?.list ?? []).map((p: any) => (
                <tr key={p.vendor_name} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{p.vendor_name}</td>
                  <td style={{ padding: "10px 12px" }}>¥{p.revenue}</td>
                  <td style={{ padding: "10px 12px" }}>¥{p.cost}</td>
                  <td style={{ padding: "10px 12px" }}>¥{p.commission}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 600, color: p.net_profit >= 0 ? "#22c55e" : "#e53935" }}>
                    ¥{p.net_profit}
                  </td>
                  <td style={{ padding: "10px 12px", color: p.margin < 15 ? "#e53935" : "#22c55e" }}>
                    {p.margin}%
                  </td>
                  <td style={{ padding: "10px 12px", color: p.trend === "up" ? "#22c55e" : "#e53935" }}>
                    {p.trend === "up" ? "📈 上升" : p.trend === "down" ? "📉 下降" : "➡️ 持平"}
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
