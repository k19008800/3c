"use client";

import { useEffect, useState } from "react";

// 系统状态页 — 客户端组件，通过 Next.js rewrite 代理访问后端 API

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
    // 通过 Next.js rewrite → localhost:3000/health
    const healthRes = await fetch("/health");
    if (!healthRes.ok) throw new Error("API health check failed");
    const health = await healthRes.json();
    const apiStatus = health.status === "ok" ? "operational" : "degraded";

    let vendors: VendorStatus[] = [];
    try {
      // 通过 Next.js rewrite → localhost:3000/api/v1/public/status
      const res = await fetch("/api/v1/public/status");
      if (res.ok) {
        const data = await res.json();
        vendors = data.vendors ?? [];
      }
    } catch { /* 供应商标识不可用 */ }

    return { api: { status: apiStatus }, vendors };
  } catch {
    return { api: { status: "unknown" }, vendors: [] };
  }
}

export default function StatusPage() {
  const [status, setStatus] = useState<StatusData | null>(null);

  useEffect(() => {
    getStatus().then(setStatus);
  }, []);

  if (!status) {
    return (
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px" }}>
        <h1 style={{ fontSize: 32, marginBottom: 24 }}>系统状态</h1>
        <p style={{ color: "#94a3b8" }}>加载中…</p>
      </div>
    );
  }

  const apiOk = status.api.status === "operational";

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 32, marginBottom: 24 }}>系统状态</h1>

      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 20, background: apiOk ? "#f0fdf4" : status.api.status === "unknown" ? "#fffbeb" : "#fef2f2", borderRadius: 12, marginBottom: 24 }}>
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: apiOk ? "#22c55e" : status.api.status === "unknown" ? "#f59e0b" : "#ef4444" }} />
        <div>
          <div style={{ fontWeight: 700 }}>
            {apiOk ? "全部系统正常运行" : status.api.status === "unknown" ? "无法连接 API 网关" : "部分系统异常"}
          </div>
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