import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { HelpIcon, SkeletonGroup } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };

export default function AdminCommissionFlowPage() {
  const [keyword, setKeyword] = useState("");
  const [period, setPeriod] = useState("month");

  const commQ = useQuery({
    queryKey: ["admin-commission-flow", keyword, period],
    queryFn: async () => (await api.get(`/admin/commission/flow?keyword=${keyword}&period=${period}&page_size=50`)).data.data,
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>佣金流水</h2>
        <HelpIcon helpKey="commission_flow" />
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
        {["today", "week", "month", "all"].map(p => (
          <button key={p} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--color-border)",
            background: period === p ? "#4f6ef7" : "#fff", color: period === p ? "#fff" : "#333", cursor: "pointer", fontSize: 13 }}
            onClick={() => setPeriod(p)}>
            {{ today: "今日", week: "本周", month: "本月", all: "全部" }[p]}
          </button>
        ))}
        <input style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", flex: 1 }}
          placeholder="搜索代理商..." value={keyword} onChange={e => setKeyword(e.target.value)} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 20 }}>
        {[{ icon: "💸", label: "佣金总额", value: commQ.data?.summary?.total != null ? `¥${commQ.data.summary.total}` : "—" },
          { icon: "👥", label: "有佣代理商", value: commQ.data?.summary?.agent_count ?? "—" },
          { icon: "📊", label: "平均佣金率", value: commQ.data?.summary?.avg_rate != null ? `${commQ.data.summary.avg_rate}%` : "—" },
          { icon: "🎯", label: "最高佣金", value: commQ.data?.summary?.max_commission != null ? `¥${commQ.data.summary.max_commission}` : "—" },
        ].map((s, i) => (
          <div key={i} style={card}>
            <div style={{ fontSize: 24 }}>{s.icon}</div>
            <div style={{ fontSize: 12, color: "#888", margin: "6px 0" }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>💸 佣金流水明细 <HelpIcon helpKey="commission_flow" /></div>
        {commQ.isLoading ? <SkeletonGroup count={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>时间</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>代理商</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>客户</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>消费金额</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>佣金率</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>佣金</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>状态</th>
            </tr></thead>
            <tbody>
              {(commQ.data?.list ?? []).map((c: any) => (
                <tr key={c.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", color: "#888", fontSize: 12 }}>{c.created_at}</td>
                  <td style={{ padding: "10px 12px" }}>{c.agent_name}</td>
                  <td style={{ padding: "10px 12px" }}>{c.customer_name}</td>
                  <td style={{ padding: "10px 12px" }}>¥{c.consume_amount}</td>
                  <td style={{ padding: "10px 12px" }}>{c.commission_rate}%</td>
                  <td style={{ padding: "10px 12px", fontWeight: 600, color: "#4f6ef7" }}>¥{c.commission}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 11,
                      background: c.status === "settled" ? "#e8f5e9" : "#fff8e1",
                      color: c.status === "settled" ? "#2e7d32" : "#e65100" }}>
                      {{ pending: "待结算", settled: "已结算", withdrawn: "已提现" }[c.status] ?? c.status}
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
