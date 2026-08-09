import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { HelpIcon, StatusBadge, SkeletonGroup } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

export default function AdminRiskPage() {
  const [period, setPeriod] = useState("today");

  const riskQ = useQuery({
    queryKey: ["admin-risk-dashboard", period],
    queryFn: async () => (await api.get(`/admin/risk/dashboard?period=${period}`)).data.data,
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>风控看板</h2>
        <HelpIcon text="risk" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 16, marginBottom: 20 }}>
        {[
          { icon: "🚨", label: "未处理风险事件", value: riskQ.data?.unhandled_events ?? "0", color: "#e53935", link: "/admin/risk/events" },
          { icon: "⛔", label: "冻结账户", value: riskQ.data?.frozen_accounts ?? "0", color: "#f59e0b" },
          { icon: "📏", label: "启用规则", value: riskQ.data?.active_rules ?? "0", color: "#4f6ef7" },
          { icon: "🛡️", label: "今日拦截", value: riskQ.data?.today_blocks ?? "0", color: "#7c3aed" },
          { icon: "⚠️", label: "安全事件", value: riskQ.data?.pending_incidents ?? "0", color: "#e53935" },
        ].map((s, i) => (
          <div key={i} style={{ ...card, borderLeft: `4px solid ${s.color}`, cursor: s.link ? "pointer" : "default" }}>
            <div style={{ fontSize: 24 }}>{s.icon}</div>
            <div style={{ fontSize: 12, color: "#888", margin: "6px 0" }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>最近风险事件 <HelpIcon text="risk" /></div>
        {riskQ.isLoading ? <SkeletonGroup lines={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>时间</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>用户</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>规则</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>详情</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>状态</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
            </tr></thead>
            <tbody>
              {(riskQ.data?.events ?? []).map((e: any) => (
                <tr key={e.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", color: "#888", fontSize: 12 }}>{e.created_at}</td>
                  <td style={{ padding: "10px 12px" }}>{e.user_email}</td>
                  <td style={{ padding: "10px 12px" }}>{e.rule_name}</td>
                  <td style={{ padding: "10px 12px" }}>{e.detail}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <StatusBadge status={e.status === "pending" ? "warning" : e.status === "handled" ? "success" : "danger"}>
                      {({ pending: "待处理", handled: "已处理", blocked: "已冻结" } as Record<string, string>)[e.status] ?? e.status}
                    </StatusBadge>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <button style={{ ...btnBase, background: "#4f6ef7", color: "#fff", fontSize: 12 }}>处理</button>
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
