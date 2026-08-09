import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { HelpIcon, StatusBadge, SkeletonGroup } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };

export default function AdminReconciliationPage() {
  const [period, setPeriod] = useState("month");

  const recQ = useQuery({
    queryKey: ["admin-reconciliation", period],
    queryFn: async () => (await api.get(`/admin/reconciliation?period=${period}`)).data.data,
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>对账报表</h2>
        <HelpIcon text="reconciliation" />
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
        {[{ icon: "💰", label: "平台收入", value: recQ.data?.summary?.revenue != null ? `¥${recQ.data.summary.revenue}` : "—" },
          { icon: "📦", label: "供应商成本", value: recQ.data?.summary?.cost != null ? `¥${recQ.data.summary.cost}` : "—" },
          { icon: "📈", label: "利润", value: recQ.data?.summary?.profit != null ? `¥${recQ.data.summary.profit}` : "—" },
          { icon: "📊", label: "毛利率", value: recQ.data?.summary?.margin != null ? `${recQ.data.summary.margin}%` : "—" },
        ].map((s, i) => (
          <div key={i} style={card}>
            <div style={{ fontSize: 24 }}>{s.icon}</div>
            <div style={{ fontSize: 12, color: "#888", margin: "6px 0" }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>📊 对账明细 <HelpIcon text="reconciliation" /></div>
        {recQ.isLoading ? <SkeletonGroup lines={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>供应商</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>消费总额</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>成本</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>利润</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>毛利率</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>差异</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>状态</th>
            </tr></thead>
            <tbody>
              {(recQ.data?.list ?? []).map((r: any) => (
                <tr key={r.vendor_name} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{r.vendor_name}</td>
                  <td style={{ padding: "10px 12px" }}>¥{r.revenue}</td>
                  <td style={{ padding: "10px 12px" }}>¥{r.cost}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 600, color: r.profit >= 0 ? "#22c55e" : "#e53935" }}>
                    ¥{r.profit}
                  </td>
                  <td style={{ padding: "10px 12px", color: r.margin < 15 ? "#e53935" : "#22c55e" }}>{r.margin}%</td>
                  <td style={{ padding: "10px 12px", color: r.diff > 0 ? "#e53935" : "#22c55e" }}>
                    {r.diff != null ? `¥${r.diff}` : "—"}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <StatusBadge status={r.status === "matched" ? "success" : "danger"}>
                      {r.status === "matched" ? "对账一致" : "有差异"}
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
