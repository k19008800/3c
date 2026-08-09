import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { HelpIcon, SkeletonGroup } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };

export default function AdminOperatorDashboardPage() {
  const [period, setPeriod] = useState("month");
  const [admin, setAdmin] = useState("");

  const opsQ = useQuery({
    queryKey: ["admin-operator-dashboard", period, admin],
    queryFn: async () => (await api.get(`/admin/operator/dashboard?period=${period}&admin=${admin}`)).data.data,
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>运营看板</h2>
        <HelpIcon text="operator_dashboard" />
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {["today", "week", "month"].map(p => (
          <button key={p} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--color-border)",
            background: period === p ? "#4f6ef7" : "#fff", color: period === p ? "#fff" : "#333", cursor: "pointer", fontSize: 13 }}
            onClick={() => setPeriod(p)}>
            {{ today: "今日", week: "本周", month: "本月" }[p]}
          </button>
        ))}
        <select style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}
          value={admin} onChange={e => setAdmin(e.target.value)}>
          <option value="">全部管理员</option>
          <option value="1">张明</option>
          <option value="2">李芳</option>
          <option value="3">王强</option>
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 20 }}>
        {[{ icon: "👥", label: "在线管理员", value: opsQ.data?.summary?.online_count ?? "—" },
          { icon: "✅", label: "处理总量", value: opsQ.data?.summary?.total_handled ?? "—" },
          { icon: "⏱️", label: "平均处理时长", value: opsQ.data?.summary?.avg_handle_time != null ? `${opsQ.data.summary.avg_handle_time}min` : "—" },
          { icon: "📋", label: "待处理积压", value: opsQ.data?.summary?.backlog ?? "—", accent: true },
        ].map((s, i) => (
          <div key={i} style={card}>
            <div style={{ fontSize: 24 }}>{s.icon}</div>
            <div style={{ fontSize: 12, color: "#888", margin: "6px 0" }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.accent ? "#f59e0b" : undefined }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>管理员效率统计 <HelpIcon text="operator_dashboard" /></div>
        {opsQ.isLoading ? <SkeletonGroup lines={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>管理员</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>工单</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>上账</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>退款</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>认证</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>提现</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>合计</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>平均响应</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>平均处理</th>
            </tr></thead>
            <tbody>
              {(opsQ.data?.ops_list ?? []).map((o: any, i: number) => (
                <tr key={o.name} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>
                    {i === 0 ? "🏆 " : i === 1 ? "🥈 " : i === 2 ? "🥉 " : ""}{o.name}
                    {o.offline ? <span style={{ color: "#888", fontSize: 11 }}> (离线)</span> : ""}
                  </td>
                  <td style={{ padding: "10px 12px" }}>{o.tickets}</td>
                  <td style={{ padding: "10px 12px" }}>{o.topups}</td>
                  <td style={{ padding: "10px 12px" }}>{o.refunds}</td>
                  <td style={{ padding: "10px 12px" }}>{o.verifications}</td>
                  <td style={{ padding: "10px 12px" }}>{o.withdrawals}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 600 }}>{o.total}</td>
                  <td style={{ padding: "10px 12px" }}>{o.avg_response_time}</td>
                  <td style={{ padding: "10px 12px" }}>{o.avg_handle_time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
