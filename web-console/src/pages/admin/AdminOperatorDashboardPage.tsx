import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { HelpIcon, SkeletonGroup } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };

/* ───────── 演示数据（后端 /admin/operator/dashboard 待接入） ───────── */
const MOCK_DASHBOARD = {
  summary: { online_count: 3, total_handled: 165, avg_handle_time: 3.5, backlog: 12 },
  ops_list: [
    { name: "张明", tickets: 28, topups: 12, refunds: 5, verifications: 8, withdrawals: 3, total: 56, avg_response_time: "2.1min", avg_handle_time: "3.5min", offline: false },
    { name: "李芳", tickets: 22, topups: 8, refunds: 3, verifications: 6, withdrawals: 2, total: 41, avg_response_time: "3.2min", avg_handle_time: "4.1min", offline: false },
    { name: "王强", tickets: 18, topups: 5, refunds: 2, verifications: 4, withdrawals: 1, total: 30, avg_response_time: "4.0min", avg_handle_time: "5.2min", offline: false },
    { name: "赵敏", tickets: 15, topups: 3, refunds: 1, verifications: 3, withdrawals: 0, total: 22, avg_response_time: "5.1min", avg_handle_time: "6.0min", offline: true },
    { name: "刘洋", tickets: 12, topups: 2, refunds: 0, verifications: 2, withdrawals: 0, total: 16, avg_response_time: "6.3min", avg_handle_time: "7.4min", offline: true },
  ],
};

export default function AdminOperatorDashboardPage() {
  const [period, setPeriod] = useState("month");
  const [admin, setAdmin] = useState("");

  const opsQ = useQuery({
    queryKey: ["admin-operator-dashboard", period, admin],
    queryFn: async () => (await api.get(`/admin/operator/dashboard?period=${period}&admin=${admin}`)).data.data,
    // 后端未实现时立即回退演示数据，避免 404 反复重试导致页面卡加载
    retry: 0,
  });

  // 后端未实现时回退到演示数据（未来接入真实端点后此兜底自动失效）
  const data = opsQ.data != null ? opsQ.data : MOCK_DASHBOARD;
  const demo = opsQ.data == null;
  const summary = data.summary;
  const opsList = data.ops_list ?? [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>运营看板</h2>
        <HelpIcon text="operator_dashboard" />
        {demo && <span style={{ fontSize: 11, color: "#f59e0b" }}>⚠️ 演示数据（后端 /admin/operator/dashboard 待接入）</span>}
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
        {[{ icon: "👥", label: "在线管理员", value: summary?.online_count ?? "—" },
          { icon: "✅", label: "处理总量", value: summary?.total_handled ?? "—" },
          { icon: "⏱️", label: "平均处理时长", value: summary?.avg_handle_time != null ? `${summary.avg_handle_time}min` : "—" },
          { icon: "📋", label: "待处理积压", value: summary?.backlog ?? "—", accent: true },
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
              {opsList.map((o: any, i: number) => (
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
