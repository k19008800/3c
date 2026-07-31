// 系统状态页 — 服务端组件（SSR）
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

interface VendorStatus {
  name: string;
  status: string;
  healthScore: number;
}

interface StatusData {
  api: { status: string };
  vendors: VendorStatus[];
}

async function getStatus(): Promise<StatusData> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/status`, { cache: "no-store" });
    if (res.ok) return await res.json();
  } catch {
    /* 兜底 */
  }
  return { api: { status: "unknown" }, vendors: [] };
}

export const metadata = {
  title: "3Cloud 系统状态",
  description: "3Cloud 各 API 端点与服务实时状态",
};

export default async function StatusPage() {
  const status = await getStatus();
  const apiOk = status.api.status === "operational";

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 32, marginBottom: 24 }}>系统状态</h1>

      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 20, background: apiOk ? "#f0fdf4" : "#fef2f2", borderRadius: 12, marginBottom: 24 }}>
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: apiOk ? "#22c55e" : "#ef4444" }} />
        <div>
          <div style={{ fontWeight: 700 }}>{apiOk ? "全部系统正常运行" : "部分系统异常"}</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>3Cloud API 网关</div>
        </div>
      </div>

      <h2 style={{ fontSize: 18, marginBottom: 12 }}>供应商状态</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
        {status.vendors.map((v) => (
          <div key={v.name} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: v.status === "operational" ? "#22c55e" : "#f59e0b" }} />
              <strong>{v.name}</strong>
            </div>
            <div style={{ fontSize: 13, color: "#64748b" }}>
              状态: {v.status === "operational" ? "正常" : "降级"} · 健康度: {v.healthScore}/100
            </div>
          </div>
        ))}
      </div>
      {status.vendors.length === 0 && <p style={{ color: "#94a3b8" }}>暂无供应商状态</p>}
    </div>
  );
}
