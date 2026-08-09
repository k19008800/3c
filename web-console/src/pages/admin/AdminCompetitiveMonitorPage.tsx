import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { HelpIcon, SkeletonGroup } from "@3cloud/shared-ui";
import { useNavigate } from "react-router-dom";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

export default function AdminCompetitiveMonitorPage() {
  const [modelType, setModelType] = useState("");

  const compQ = useQuery({
    queryKey: ["admin-competitive-monitor", modelType],
    queryFn: async () => (await api.get(`/admin/competitive/monitor?model_type=${modelType}`)).data.data,
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>竞品价格监控</h2>
        <HelpIcon text="competitive_monitor" />
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
        <select style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}
          value={modelType} onChange={e => setModelType(e.target.value)}>
          <option value="">全部类型</option>
          <option value="text">文本模型</option>
          <option value="vision">视觉模型</option>
          <option value="reasoning">推理模型</option>
          <option value="embedding">嵌入模型</option>
        </select>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>🔍 竞品价格对比 <HelpIcon text="competitive_monitor" /></div>
        {compQ.isLoading ? <SkeletonGroup lines={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>模型</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>3Cloud 价格</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>竞品A价格</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>竞品B价格</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>竞品C价格</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>价格优势</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>更新</th>
            </tr></thead>
            <tbody>
              {(compQ.data?.list ?? []).map((c: any) => {
                const advantage = c.competitor_lowest != null
                  ? Math.round((c.competitor_lowest - c.our_price) / c.competitor_lowest * 100)
                  : null;
                return (
                  <tr key={c.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 500 }}>{c.model_name}</td>
                    <td style={{ padding: "10px 12px", fontWeight: 600 }}>¥{c.our_price}/1K tokens</td>
                    <td style={{ padding: "10px 12px" }}>¥{c.comp_a_price}</td>
                    <td style={{ padding: "10px 12px" }}>¥{c.comp_b_price}</td>
                    <td style={{ padding: "10px 12px" }}>¥{c.comp_c_price}</td>
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: advantage != null && advantage > 0 ? "#22c55e" : advantage != null && advantage < 0 ? "#e53935" : "#888" }}>
                      {advantage != null ? (advantage > 0 ? `↓${advantage}%` : `↑${Math.abs(advantage)}%`) : "—"}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#888", fontSize: 11 }}>{c.updated_at}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
