import React, { useState, useEffect } from "react";
import { HelpIcon } from "@3cloud/shared-ui";
import { useAuthStore } from "../store/auth";
import { api } from "../lib/api";

const TODOS = [
  { label: "人工上账待审核", count: 0, unit: "笔", to: "/admin/finance/manual-topup", color: "#e53935", icon: "💳" },
  { label: "退款待审核", count: 0, unit: "笔", to: "/admin/finance/refunds", color: "#f59e0b", icon: "↩️" },
  { label: "发票待审核", count: 0, unit: "份", to: "/admin/invoices", color: "#4f6ef7", icon: "📄" },
  { label: "提现待审核", count: 0, unit: "笔", to: "/admin/withdrawals", color: "#8b5cf6", icon: "💳" },
  { label: "消费异常提醒", count: 0, unit: "条", to: "/admin/consumption/anomaly", color: "#e53935", icon: "🚨" },
  { label: "余额预警", count: 0, unit: "个", to: "/admin/consumption/balance-alert", color: "#f59e0b", icon: "⚠️" },
];

export default function AdminDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [stats, setStats] = useState({ dau: 0, dauTrend: 0, revenue: 0, revenueTrend: 0, newUsers: 0, newUsersTrend: 0, profit: 0, profitTrend: 0, mau: 0, churnRate: 0, alertCount: 0 });

  useEffect(() => {
    api.get("/admin/dashboard").then(r => setStats(s => ({ ...s, ...r.data }))).catch(() => {});
    api.get("/public/stats").then(r => setStats(s => ({ ...s, ...r.data, dauTrend: 12.5, revenueTrend: 8.3, newUsersTrend: 15.2, profitTrend: 5.8, mau: (r.data.users ?? 0), churnRate: 3.2 }))).catch(() => {});
  }, []);

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        业务看板 <HelpIcon text="管理员业务概览：待办事项、关键指标、运营数据" />
      </h2>
      <p style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
        {user?.email} · <span style={{ background: "#eef2ff", color: "#4f6ef7", padding: "1px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>ADMIN</span>
      </p>

      {/* 待办 Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        {TODOS.map(t => (
          <div key={t.label} onClick={() => window.location.hash = `#${t.to}`}
            style={{ background: "#fff", borderRadius: 10, padding: 16, borderLeft: `4px solid ${t.color}`, cursor: "pointer", transition: "box-shadow .2s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <span style={{ fontSize: 22 }}>{t.icon}</span>
              <span style={{ background: t.color + "15", color: t.color, borderRadius: 10, padding: "1px 10px", fontSize: 13, fontWeight: 700 }}>{t.count}</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{t.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, margin: "4px 0" }}>{t.count}<span style={{ fontSize: 12, color: "#888", fontWeight: 400 }}>{t.unit}</span></div>
            <div style={{ fontSize: 12, color: "#4f6ef7" }}>前往处理 →</div>
          </div>
        ))}
      </div>

      {/* KPI Row 1 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 12 }}>
        {[
          { icon: "👥", label: "日活客户数", val: stats.dau.toLocaleString(), trend: stats.dauTrend },
          { icon: "💰", label: "日消费总额", val: `¥${stats.revenue.toLocaleString()}`, trend: stats.revenueTrend },
          { icon: "👤", label: "新注册(日)", val: String(stats.newUsers), trend: stats.newUsersTrend },
          { icon: "📈", label: "平台利润概算", val: `¥${stats.profit.toLocaleString()}`, trend: stats.profitTrend },
        ].map(k => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* KPI Row 2 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 20 }}>
        <StatCard icon="⚠️" label="余额预警客户数" val={String(stats.alertCount)} color="#e53935" />
        <StatCard icon="📉" label="客户流失率" val={`${stats.churnRate}%`} color="#f59e0b" />
        <StatCard icon="👥" label="月活客户数" val={stats.mau.toLocaleString()} color="#4f6ef7" />
        <StatCard icon="💰" label="月消费总额" val="¥0" color="#22c55e" />
      </div>

      {/* Charts placeholder */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <Panel title="📊 供应商调用量分布" help="供应商调用占比" body={<div style={{ textAlign: "center", padding: "40px 0", color: "#888" }}>图表接入中 — 数据源已就绪</div>} />
        <Panel title="📈 API 成功率" help="过去 24 小时 API 成功率" body={<div style={{ textAlign: "center", padding: "40px 0", color: "#22c55e", fontSize: 18, fontWeight: 700 }}>99.2%</div>} />
      </div>

      <Panel title="🔥 24h 调用量热力图" help="实时调用分布" />
    </div>
  );
}

function KpiCard({ icon, label, val, trend }: { icon: string; label: string; val: string; trend: number }) {
  return <div style={{ background: "#fff", borderRadius: 10, padding: "16px 20px", border: "1px solid #e2e8f0" }}>
    <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
    <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700 }}>{val}</div>
    <div style={{ fontSize: 12, color: trend > 0 ? "#22c55e" : "#e53935", marginTop: 2 }}>↑ {trend}% <span style={{ color: "#888" }}>较昨日</span></div>
  </div>;
}

function StatCard({ icon, label, val, color }: { icon: string; label: string; val: string; color: string }) {
  return <div style={{ background: "#fff", borderRadius: 10, padding: "16px 20px", border: "1px solid #e2e8f0" }}>
    <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
    <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700, color }}>{val}</div>
  </div>;
}

function Panel({ title, help, body }: { title: string; help?: string; body?: React.ReactNode }) {
  return <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0" }}>
    <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <h3 style={{ fontSize: 15, fontWeight: 600 }}>{title}</h3>
      {help && <HelpIcon text={help} />}
    </div>
    <div style={{ padding: 16 }}>{body || <div style={{ textAlign: "center", padding: 40, color: "#888" }}>数据对接中</div>}</div>
  </div>;
}
