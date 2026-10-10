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

  const overviewTone = !status
    ? "ok"
    : status.api.status === "operational"
      ? "ok"
      : status.api.status === "unknown"
        ? "warn"
        : "err";

  return (
    <div>
      <section className="page-head">
        <div className="container">
          <span className="overline">System Status</span>
          <h1>系统状态</h1>
          <p className="page-subtitle">实时查看 3Cloud 各 API 端点与供应商服务的运行状况</p>
        </div>
      </section>

      <section className="container" style={{ paddingBottom: "var(--space-8xl)" }}>
        {!status ? (
          <p className="empty-state">加载中…</p>
        ) : (
          <>
            <div className={`status-overview ${overviewTone}`}>
              <span className="so-dot" />
              <div>
                <div className="so-title">
                  {status.api.status === "operational"
                    ? "全部系统正常运行"
                    : status.api.status === "unknown"
                      ? "无法连接 API 网关"
                      : "部分系统异常"}
                </div>
                <div className="so-sub">3Cloud API 网关</div>
              </div>
            </div>

            <h2 style={{ fontSize: "var(--font-size-h4)", fontWeight: 700, color: "var(--color-text)", marginBottom: "var(--space-lg)" }}>
              供应商状态
            </h2>
            <div className="vendor-grid">
              {status.vendors.map((v) => {
                const up = v.status === "operational";
                return (
                  <div key={v.name} className="vendor-card">
                    <div className="vc-head">
                      <span className={`vc-dot ${up ? "up" : "down"}`} />
                      <span className="vc-name">{v.name}</span>
                    </div>
                    <div className="vc-meta">
                      状态：{up ? "正常" : "降级"} · 健康度：{v.healthScore}/100
                    </div>
                  </div>
                );
              })}
            </div>
            {status.vendors.length === 0 && <p className="empty-state">暂无供应商状态</p>}
          </>
        )}
      </section>
    </div>
  );
}
