import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { HelpIcon, SkeletonGroup } from "@3cloud/shared-ui";
import { useNavigate } from "react-router-dom";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

/* ───────── 演示数据（对齐原型 admin-competitive-monitor.html 分布） ───────── */

interface CompRow { id: number; model_name: string; our_price: number; comp_a_price: number; comp_b_price: number; comp_c_price: number; competitor_lowest: number | null; updated_at: string; }
interface CompData { list: CompRow[]; demo?: boolean; }

const MOCK: CompData = {
  list: [
    { id: 1, model_name: "GPT-4o", our_price: 0.005, comp_a_price: 0.006, comp_b_price: 0.0055, comp_c_price: 0.0065, competitor_lowest: 0.0055, updated_at: "2026-08-10 09:00" },
    { id: 2, model_name: "Claude 3.5 Sonnet", our_price: 0.003, comp_a_price: 0.0035, comp_b_price: 0.0032, comp_c_price: 0.004, competitor_lowest: 0.0032, updated_at: "2026-08-10 08:45" },
    { id: 3, model_name: "GPT-4o mini", our_price: 0.0015, comp_a_price: 0.0012, comp_b_price: 0.0014, comp_c_price: 0.0018, competitor_lowest: 0.0012, updated_at: "2026-08-10 08:30" },
    { id: 4, model_name: "Qwen-Plus", our_price: 0.002, comp_a_price: 0.0018, comp_b_price: 0.0022, comp_c_price: 0.0021, competitor_lowest: 0.0018, updated_at: "2026-08-09 22:10" },
    { id: 5, model_name: "DeepSeek-V3", our_price: 0.001, comp_a_price: 0.0008, comp_b_price: 0.0012, comp_c_price: 0.0011, competitor_lowest: 0.0008, updated_at: "2026-08-09 21:55" },
  ],
  demo: true,
};

export default function AdminCompetitiveMonitorPage() {
  const [modelType, setModelType] = useState("");

  const compQ = useQuery({
    queryKey: ["admin-competitive-monitor", modelType],
    queryFn: async () => (await api.get(`/admin/competitive/monitor?model_type=${modelType}`)).data.data,
    // 后端未实现时立即回退演示数据，避免 404 反复重试导致页面卡加载
    retry: 0,
  });

  // 后端未实现时回退到演示数据（未来接入真实端点后此兜底自动失效）
  const data: CompData = compQ.data?.list != null ? compQ.data : MOCK;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>竞品价格监控</h2>
        <HelpIcon text="competitive_monitor" />
        {data.demo && <span style={{ fontSize: 11, color: "#f59e0b" }}>⚠️ 演示数据（后端 /admin/competitive/monitor 待接入）</span>}
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
              {(data.list ?? []).map((c: CompRow) => {
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
