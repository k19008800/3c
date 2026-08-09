import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { HelpIcon, SkeletonGroup } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };

export default function AdminVendorStatsPage() {
  const [period, setPeriod] = useState("month");

  const statsQ = useQuery({
    queryKey: ["admin-vendor-stats", period],
    queryFn: async () => (await api.get(`/admin/vendor-stats?period=${period}`)).data.data,
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>用户选购统计</h2>
        <HelpIcon text="vendor_stats" />
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
        {[{ icon: "👥", label: "选择用户数", value: statsQ.data?.summary?.user_count ?? "—" },
          { icon: "🔄", label: "切换率", value: statsQ.data?.summary?.switch_rate != null ? `${statsQ.data.summary.switch_rate}%` : "—" },
          { icon: "💰", label: "收入贡献", value: statsQ.data?.summary?.revenue != null ? `¥${statsQ.data.summary.revenue}` : "—" },
          { icon: "🏆", label: "最受欢迎", value: statsQ.data?.summary?.top_vendor ?? "—" },
        ].map((s, i) => (
          <div key={i} style={card}>
            <div style={{ fontSize: 24 }}>{s.icon}</div>
            <div style={{ fontSize: 12, color: "#888", margin: "6px 0" }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>📊 供应商选择分布 <HelpIcon text="vendor_stats" /></div>
        {statsQ.isLoading ? <SkeletonGroup lines={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>供应商</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>选择用户数</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>占比</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>切换率</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>价格敏感度</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>收入贡献</th>
            </tr></thead>
            <tbody>
              {(statsQ.data?.vendors ?? []).map((v: any) => (
                <tr key={v.name} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{v.name}</td>
                  <td style={{ padding: "10px 12px" }}>{v.user_count}</td>
                  <td style={{ padding: "10px 12px" }}>{v.percentage}%</td>
                  <td style={{ padding: "10px 12px" }}>{v.switch_rate}%</td>
                  <td style={{ padding: "10px 12px" }}>{v.price_sensitivity ?? "—"}</td>
                  <td style={{ padding: "10px 12px" }}>¥{v.revenue_contribution ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
