import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { HelpIcon, StatusBadge, SkeletonGroup } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };

export default function AdminVendorPerformancePage() {
  const [period, setPeriod] = useState("month");

  const perfQ = useQuery({
    queryKey: ["admin-vendor-performance", period],
    queryFn: async () => (await api.get(`/admin/vendor-performance?period=${period}`)).data.data,
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>供应商绩效</h2>
        <HelpIcon text="vendor_performance" />
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
        {[{ icon: "📊", label: "平均可用率", value: perfQ.data?.summary?.avg_uptime != null ? `${perfQ.data.summary.avg_uptime}%` : "—" },
          { icon: "⚡", label: "平均延迟", value: perfQ.data?.summary?.avg_latency != null ? `${perfQ.data.summary.avg_latency}ms` : "—" },
          { icon: "✅", label: "成功率", value: perfQ.data?.summary?.success_rate != null ? `${perfQ.data.summary.success_rate}%` : "—" },
          { icon: "🏆", label: "最佳厂商", value: perfQ.data?.summary?.top_performer ?? "—" },
        ].map((s, i) => (
          <div key={i} style={card}>
            <div style={{ fontSize: 24 }}>{s.icon}</div>
            <div style={{ fontSize: 12, color: "#888", margin: "6px 0" }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>🏆 供应商绩效排名 <HelpIcon text="vendor_performance" /></div>
        {perfQ.isLoading ? <SkeletonGroup lines={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>排名</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>供应商</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>可用率</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>平均延迟</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>成功率</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>总调用量</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>评分</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>等级</th>
            </tr></thead>
            <tbody>
              {(perfQ.data?.vendors ?? []).map((v: any, i: number) => (
                <tr key={v.name} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px" }}>
                    {i === 0 ? "🏆" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                  </td>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{v.name}</td>
                  <td style={{ padding: "10px 12px", color: v.uptime >= 99 ? "#22c55e" : v.uptime >= 95 ? "#f59e0b" : "#e53935" }}>
                    {v.uptime}%
                  </td>
                  <td style={{ padding: "10px 12px" }}>{v.avg_latency}ms</td>
                  <td style={{ padding: "10px 12px" }}>{v.success_rate}%</td>
                  <td style={{ padding: "10px 12px" }}>{v.total_calls?.toLocaleString() ?? "—"}</td>
                  <td style={{ padding: "10px 12px" }}>{v.score}/100</td>
                  <td style={{ padding: "10px 12px" }}>
                    <StatusBadge status={v.grade === "A" ? "success" : v.grade === "B" ? "info" : v.grade === "C" ? "warning" : "danger"}>
                      {v.grade}
                    </StatusBadge>
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
