import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { HelpIcon, SkeletonGroup } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

export default function AdminConsumptionTrackingPage() {
  const [keyword, setKeyword] = useState("");
  const [period, setPeriod] = useState("today");

  const trackQ = useQuery({
    queryKey: ["admin-consumption-tracking", keyword, period],
    queryFn: async () => (await api.get(`/admin/consumption/tracking?keyword=${keyword}&period=${period}&page_size=50`)).data.data,
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>消费追踪</h2>
        <HelpIcon helpKey="consumption_tracking" />
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
        {["today", "yesterday", "week", "month"].map(p => (
          <button key={p} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--color-border)",
            background: period === p ? "#4f6ef7" : "#fff", color: period === p ? "#fff" : "#333", cursor: "pointer", fontSize: 13 }}
            onClick={() => setPeriod(p)}>
            {{ today: "今日", yesterday: "昨日", week: "本周", month: "本月" }[p]}
          </button>
        ))}
        <input style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", flex: 1 }}
          placeholder="搜索用户/模型..." value={keyword} onChange={e => setKeyword(e.target.value)} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 20 }}>
        {[{ icon: "👥", label: "活跃用户数", value: trackQ.data?.summary?.active_users ?? "—" },
          { icon: "🤖", label: "调用模型数", value: trackQ.data?.summary?.model_count ?? "—" },
          { icon: "📊", label: "总请求数", value: trackQ.data?.summary?.total_requests?.toLocaleString() ?? "—" },
          { icon: "💰", label: "总消费", value: trackQ.data?.summary?.total_cost != null ? `¥${trackQ.data.summary.total_cost}` : "—" },
        ].map((s, i) => (
          <div key={i} style={card}>
            <div style={{ fontSize: 24 }}>{s.icon}</div>
            <div style={{ fontSize: 12, color: "#888", margin: "6px 0" }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>📊 消费明细 <HelpIcon helpKey="consumption_tracking" /></div>
        {trackQ.isLoading ? <SkeletonGroup count={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>用户</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>请求数</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>总 Tokens</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>消费金额</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>最常用模型</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>最常用供应商</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
            </tr></thead>
            <tbody>
              {(trackQ.data?.list ?? []).map((t: any) => (
                <tr key={t.user_id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{t.user_email}</td>
                  <td style={{ padding: "10px 12px" }}>{t.request_count?.toLocaleString()}</td>
                  <td style={{ padding: "10px 12px" }}>{t.total_tokens?.toLocaleString()}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 600 }}>¥{t.total_cost}</td>
                  <td style={{ padding: "10px 12px" }}>{t.top_model}</td>
                  <td style={{ padding: "10px 12px", color: "#888" }}>{t.top_vendor}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <button style={{ ...btnBase, background: "#f0f0f0", fontSize: 12 }}>详情</button>
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
