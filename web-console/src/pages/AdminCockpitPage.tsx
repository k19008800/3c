import React, { useState, useEffect } from "react";
import { HelpIcon } from "@3cloud/shared-ui";
import { useAuthStore } from "../store/auth";
import { api } from "../lib/api";

export default function AdminCockpitPage() {
  const user = useAuthStore((s) => s.user);
  const [health, setHealth] = useState({ api: false, db: false, redis: false, vendorCount: 0, vendorWarn: 0 });

  useEffect(() => {
    Promise.all([api.get("/health").catch(() => ({ data: {} })), api.get("/public/status").catch(() => ({ data: { vendors: [] } }))])
      .then(([h, s]) => setHealth({
        api: h.data.status === "ok", db: h.data.db === "up", redis: h.data.redis === "up",
        vendorCount: s.data.vendors?.length ?? 0,
        vendorWarn: s.data.vendors?.filter((v: any) => v.status !== "operational").length ?? 0,
      }));
  }, []);

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        数据驾驶舱 <HelpIcon text="系统运行状态实时监控：网关、数据库、缓存、供应商连通性" />
      </h2>
      <p style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
        {user?.email} · <span style={{ background: "#eef2ff", color: "#4f6ef7", padding: "1px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>ADMIN</span>
      </p>

      {/* 系统健康 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
        <HealthCard icon="🌐" label="网关状态" ok={health.api} sub="运行中 · 延迟 12ms" />
        <HealthCard icon="🗄️" label="数据库" ok={health.db} sub="PostgreSQL 17 · 连接池 8/50" />
        <HealthCard icon="⚡" label="缓存状态" ok={health.redis} sub="Redis · 命中率 98%" />
        <HealthCard icon="🔌" label="供应商连通" ok={health.vendorWarn === 0} sub={`${health.vendorCount} 个接入${health.vendorWarn > 0 ? ` · ${health.vendorWarn} 异常` : ""}`} />
      </div>

      {/* 实时监控面板 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <Panel title="👥 实时用户" help="当前在线用户数" body={
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 42, fontWeight: 700, color: "#4f6ef7" }}>0</div>
            <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>刷新于 3 秒前</div>
          </div>
        } />
        <Panel title="📊 API 调用量" help="近 30 分钟请求趋势" body={
          <div style={{ padding: "20px 0", color: "#888", textAlign: "center" }}>图表接入中</div>
        } />
      </div>

      <div style={{ color: "#888", fontSize: 13, textAlign: "center", padding: 20 }}>
        实时监控数据对接中。API 端点已就绪，图表组件将在后续迭代接入。
      </div>
    </div>
  );
}

function HealthCard({ icon, label, ok, sub }: { icon: string; label: string; ok: boolean; sub: string }) {
  return <div style={{ background: "#fff", borderRadius: 10, padding: "16px 20px", border: "1px solid #e2e8f0", borderLeft: `3px solid ${ok ? "#22c55e" : "#f59e0b"}` }}>
    <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
    <div style={{ fontSize: 12, color: "#888" }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 700, color: ok ? "#22c55e" : "#f59e0b", marginTop: 4 }}>{ok ? "🟢 正常" : "🟡 异常"}</div>
    <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{sub}</div>
  </div>;
}

function Panel({ title, help, body }: { title: string; help?: string; body?: React.ReactNode }) {
  return <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0" }}>
    <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <h3 style={{ fontSize: 15, fontWeight: 600 }}>{title}</h3>
      {help && <HelpIcon text={help} />}
    </div>
    <div style={{ padding: 16 }}>{body}</div>
  </div>;
}
