/**
 * AdminCockpitPage — 数据驾驶舱（对齐 admin-cockpit.html 原型）
 */
import React, { useState, useEffect } from "react";
import { HelpIcon } from "@3cloud/shared-ui";
import { useAuthStore } from "../store/auth";
import { api } from "../lib/api";

interface SystemHealth {
  api: boolean;
  db: boolean;
  redis: boolean;
  vendorCount: number;
  vendorWarn: number;
}

export default function AdminCockpitPage() {
  const user = useAuthStore((s) => s.user);
  const [health, setHealth] = useState<SystemHealth>({ api: false, db: false, redis: false, vendorCount: 0, vendorWarn: 0 });

  useEffect(() => {
    Promise.all([
      api.get("/health").catch(() => ({ data: { status: "error" } })),
      api.get("/public/status").catch(() => ({ data: { vendors: [] } })),
    ]).then(([h, s]) => {
      const hd = h.data;
      setHealth({
        api: hd.status === "ok",
        db: hd.db === "up",
        redis: hd.redis === "up",
        vendorCount: s.data.vendors?.length ?? 0,
        vendorWarn: s.data.vendors?.filter((v: any) => v.status !== "operational").length ?? 0,
      });
    });
  }, []);

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
        数据驾驶舱 <HelpIcon text="系统运行状态实时监控：网关、数据库、缓存、供应商连通性" />
      </h2>
      <p style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
        {user?.email} · <span style={{ background: "#eef2ff", color: "#4f6ef7", padding: "2px 8px", borderRadius: 4, fontSize: 12 }}>ADMIN</span>
      </p>

      {/* 系统健康状态 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
        <StatCard icon="🌐" label="网关状态" value="正常" color="#22c55e" ok={health.api} sub="运行中" />
        <StatCard icon="🗄️" label="数据库" value="正常" color="#22c55e" ok={health.db} sub="PostgreSQL 17" />
        <StatCard icon="⚡" label="缓存状态" value="正常" color="#22c55e" ok={health.redis} sub="Redis" />
        <StatCard icon="🔌" label="供应商连通" value={health.vendorWarn > 0 ? `${health.vendorWarn}异常` : "正常"} color={health.vendorWarn > 0 ? "#f59e0b" : "#22c55e"} ok={health.vendorWarn === 0} sub={`${health.vendorCount} 个接入`} />
      </div>

      <div style={{ color: "#888", fontSize: 13, textAlign: "center", padding: 40 }}>
        系统监控数据实时对接中。当前展示为结构预览，完整实时图表将在后续迭代中接入。
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color, ok, sub }: { icon: string; label: string; value: string; color: string; ok: boolean; sub: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: "16px 20px", border: "1px solid #e2e8f0", borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 12, color: "#888" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 4 }}>{ok ? "🟢" : "🟡"} {value}</div>
      <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{sub}</div>
    </div>
  );
}
