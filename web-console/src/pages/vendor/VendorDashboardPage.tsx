import { useQuery } from "@tanstack/react-query";
import { vendorApi } from "../../lib/vendor-api";

interface Dashboard {
  today: { calls: number; success: number; tokens: number; cost: number; avg_latency: number; availability: number };
  trend: { day: string; calls: number; cost: number }[];
  model_ranking: { model: string; calls: number; cost: number }[];
}

const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };

export default function VendorDashboardPage() {
  const q = useQuery({
    queryKey: ["vendor-dashboard"],
    queryFn: async () => (await vendorApi.get<Dashboard>("/vendor/dashboard")),
  });
  const d = q.data;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 20 }}>仪表盘</h2>

      {/* 今日统计 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 16, marginBottom: 24 }}>
        <Stat label="今日调用量" value={String(d?.today.calls ?? "-")} hint={`成功 ${d?.today.success ?? 0}`} />
        <Stat label="今日收入(成本计)" value={`¥${(d?.today.cost ?? 0).toFixed(2)}`} hint="上游调用成本" />
        <Stat label="Tokens" value={(d?.today.tokens ?? 0).toLocaleString()} hint="今日总量" />
        <Stat label="可用率" value={`${d?.today.availability ?? "-"}%`} hint="成功/总调用" />
        <Stat label="平均延迟" value={`${d?.today.avg_latency ?? "-"}ms`} hint="成功请求" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
        {/* 近7天趋势 */}
        <div style={card}>
          <h3 style={{ marginBottom: 16 }}>近 7 天调用趋势</h3>
          <BarChart data={(d?.trend ?? []).map(t => ({ label: t.day.slice(5), value: t.calls }))} />
        </div>
        {/* 模型排行 */}
        <div style={card}>
          <h3 style={{ marginBottom: 16 }}>模型调用排行</h3>
          {!d?.model_ranking?.length ? <div style={{ color: "#94a3b8" }}>暂无调用数据</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ color: "#64748b", textAlign: "left" }}><th style={{ padding: "6px" }}>模型</th><th style={{ padding: "6px" }}>调用</th><th style={{ padding: "6px" }}>成本</th></tr></thead>
              <tbody>
                {d.model_ranking.map((m) => (
                  <tr key={m.model} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "6px", fontWeight: 600 }}>{m.model}</td>
                    <td style={{ padding: "6px" }}>{m.calls}</td>
                    <td style={{ padding: "6px" }}>¥{m.cost.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {q.isLoading && <div style={{ color: "#94a3b8", marginTop: 12, fontSize: 13 }}>加载中...</div>}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{hint}</div>
    </div>
  );
}

function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140, padding: "8px 4px" }}>
      {data.length === 0 ? <div style={{ color: "#94a3b8", fontSize: 13, alignSelf: "center" }}>暂无数据</div> : data.map((d) => (
        <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div title={`${d.label}: ${d.value}`} style={{ width: "100%", maxWidth: 36, height: Math.max(2, (d.value / max) * 110), background: d.value > 0 ? "#0ea5e9" : "#e2e8f0", borderRadius: "3px 3px 0 0" }} />
          <div style={{ fontSize: 9, color: "#94a3b8" }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}
