import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { HelpIcon, SkeletonGroup } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };

export default function AdminConsumptionStreamPage() {
  const [vendor, setVendor] = useState("");

  const streamQ = useQuery({
    queryKey: ["admin-consumption-stream", vendor],
    queryFn: async () => (await api.get(`/admin/consumption/stream?vendor=${vendor}`)).data.data,
    refetchInterval: 10000,
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>消费流监控</h2>
        <HelpIcon text="consumption_stream" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 20 }}>
        {[{ icon: "⚡", label: "实时 QPS", value: streamQ.data?.metrics?.qps ?? "—" },
          { icon: "💰", label: "当前消费速率", value: streamQ.data?.metrics?.burn_rate != null ? `¥${streamQ.data.metrics.burn_rate}/min` : "—" },
          { icon: "🔄", label: "活跃请求", value: streamQ.data?.metrics?.active_requests ?? "—" },
          { icon: "✅", label: "成功率", value: streamQ.data?.metrics?.success_rate != null ? `${streamQ.data.metrics.success_rate}%` : "—" },
        ].map((s, i) => (
          <div key={i} style={card}>
            <div style={{ fontSize: 24 }}>{s.icon}</div>
            <div style={{ fontSize: 12, color: "#888", margin: "6px 0" }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
        <select style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}
          value={vendor} onChange={e => setVendor(e.target.value)}>
          <option value="">全部供应商</option>
          <option value="1">DeepSeek</option>
          <option value="2">OpenAI</option>
          <option value="3">GLM</option>
        </select>
        <span style={{ fontSize: 12, color: "#888" }}>🔴 自动刷新 (10s)</span>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>📊 实时消费流 <HelpIcon text="consumption_stream" /></div>
        {streamQ.isLoading ? <SkeletonGroup lines={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>时间</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>用户</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>模型</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>供应商</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>Tokens</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>费用</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>延迟</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>状态</th>
            </tr></thead>
            <tbody>
              {(streamQ.data?.stream ?? []).map((s: any) => (
                <tr key={s.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", color: "#888", fontSize: 12 }}>{s.timestamp}</td>
                  <td style={{ padding: "10px 12px", fontSize: 12 }}>{s.user}</td>
                  <td style={{ padding: "10px 12px" }}>{s.model}</td>
                  <td style={{ padding: "10px 12px", color: "#888" }}>{s.vendor}</td>
                  <td style={{ padding: "10px 12px" }}>{s.tokens?.toLocaleString()}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>¥{s.cost}</td>
                  <td style={{ padding: "10px 12px" }}>{s.latency}ms</td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                      background: s.status === "success" ? "#22c55e" : "#e53935", marginRight: 4 }} />
                    {s.status}
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
