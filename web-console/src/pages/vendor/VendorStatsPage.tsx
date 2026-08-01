import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { vendorApi } from "../../lib/vendor-api";

interface Stats {
  range: string;
  trend: { day: string; calls: number; tokens: number; cost: number }[];
  by_model: { model: string; calls: number; cost: number }[];
}

const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13, color: "#475569" };

export default function VendorStatsPage() {
  const [range, setRange] = useState("7d");
  const q = useQuery({
    queryKey: ["vendor-stats", range],
    queryFn: async () => (await vendorApi.get<Stats>(`/vendor/stats?range=${range}`)),
  });
  const d = q.data;
  const maxCalls = Math.max(...(d?.trend ?? []).map(t => t.calls), 1);
  const maxCost = Math.max(...(d?.trend ?? []).map(t => t.cost), 1);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 20 }}>数据统计</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[{ v: "7d", l: "最近 7 天" }, { v: "30d", l: "最近 30 天" }, { v: "90d", l: "最近 90 天" }].map(r => (
          <button key={r.v} onClick={() => setRange(r.v)} style={{ ...btnBase, background: range === r.v ? "#0ea5e9" : "#fff", color: range === r.v ? "#fff" : "#475569", border: range === r.v ? "1px solid #0ea5e9" : "1px solid #cbd5e1" }}>{r.l}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
        <div style={card}>
          <h3 style={{ marginBottom: 16 }}>调用趋势</h3>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 160, padding: "8px 4px" }}>
            {!d?.trend?.length ? <div style={{ color: "#94a3b8" }}>暂无数据</div> : d.trend.map(t => (
              <div key={t.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div title={`${t.day}: ${t.calls} 次`} style={{ width: "100%", height: Math.max(2, (t.calls / maxCalls) * 120), background: "#0ea5e9", borderRadius: "2px 2px 0 0" }} />
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>{d?.trend?.length ? `共 ${d.trend.length} 天数据（纵轴=调用量）` : ""}</div>
        </div>

        <div style={card}>
          <h3 style={{ marginBottom: 16 }}>成本趋势</h3>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 160, padding: "8px 4px" }}>
            {!d?.trend?.length ? <div style={{ color: "#94a3b8" }}>暂无数据</div> : d.trend.map(t => (
              <div key={t.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div title={`${t.day}: ¥${t.cost.toFixed(4)}`} style={{ width: "100%", height: Math.max(2, (t.cost / maxCost) * 120), background: "#8b5cf6", borderRadius: "2px 2px 0 0" }} />
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>{d?.trend?.length ? `成本（¥）` : ""}</div>
        </div>
      </div>

      {/* 按模型分布 */}
      <div style={{ ...card, marginTop: 24 }}>
        <h3 style={{ marginBottom: 16 }}>按模型分布</h3>
        {!d?.by_model?.length ? <div style={{ color: "#94a3b8" }}>暂无数据</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ color: "#64748b", textAlign: "left" }}><th style={{ padding: "8px" }}>模型</th><th style={{ padding: "8px" }}>调用量</th><th style={{ padding: "8px" }}>成本</th></tr></thead>
            <tbody>
              {d.by_model.map(m => (
                <tr key={m.model} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px", fontWeight: 600 }}>{m.model}</td>
                  <td style={{ padding: "8px" }}>{m.calls}</td>
                  <td style={{ padding: "8px" }}>¥{m.cost.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
