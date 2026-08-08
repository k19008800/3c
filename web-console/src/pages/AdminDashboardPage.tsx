/**
 * AdminDashboardPage — 业务看板（对齐 admin-dashboard.html 原型）
 * 仅 admin/super_admin 可见
 */
import React, { useState, useEffect } from "react";
import { HelpIcon } from "@3cloud/shared-ui";
import { useAuthStore } from "../store/auth";
import { api } from "../lib/api";

interface DashboardStats {
  dau: number;
  dauTrend: number;
  revenue: number;
  revenueTrend: number;
  newUsers: number;
  newUsersTrend: number;
  profit: number;
  profitTrend: number;
  mau: number;
  churnRate: number;
}

interface TodoItem {
  label: string;
  count: number;
  unit: string;
  to: string;
  color: string;
  icon: string;
}

const TODOS: TodoItem[] = [
  { label: "人工上账待审核", count: 0, unit: "笔", to: "/admin/finance", color: "#e53935", icon: "💳" },
  { label: "退款待审核", count: 0, unit: "笔", to: "/admin/finance", color: "#f59e0b", icon: "↩️" },
  { label: "发票待审核", count: 0, unit: "份", to: "/admin/invoices", color: "#4f6ef7", icon: "📄" },
  { label: "提现待审核", count: 0, unit: "笔", to: "/admin/withdrawals", color: "#8b5cf6", icon: "💳" },
];

export default function AdminDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [stats, setStats] = useState<DashboardStats>({
    dau: 0, dauTrend: 0, revenue: 0, revenueTrend: 0,
    newUsers: 0, newUsersTrend: 0, profit: 0, profitTrend: 0,
    mau: 0, churnRate: 0,
  });

  useEffect(() => {
    api.get("/admin/dashboard").then(r => setStats(r.data)).catch(() => {});
  }, []);

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
        业务看板 <HelpIcon text="管理员业务概览：待办事项、关键指标、运营数据" />
      </h2>
      <p style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
        {user?.email} · <span style={{ background: "#eef2ff", color: "#4f6ef7", padding: "2px 8px", borderRadius: 4, fontSize: 12 }}>ADMIN</span>
      </p>

      {/* 待办 Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
        {TODOS.map((t) => (
          <div key={t.label} style={{ background: "#fff", borderRadius: 10, padding: 16, borderLeft: `4px solid ${t.color}`, cursor: "pointer" }} onClick={() => window.location.hash = t.to}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: 24 }}>{t.icon}</span>
              <span style={{ background: t.color, color: "#fff", borderRadius: 10, padding: "2px 8px", fontSize: 12, fontWeight: 600 }}>{t.count}</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, marginTop: 8 }}>{t.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{t.count}<span style={{ fontSize: 12, color: "#888", fontWeight: 400 }}>{t.unit}</span></div>
            <div style={{ fontSize: 12, color: "#4f6ef7", marginTop: 8 }}>前往处理 →</div>
          </div>
        ))}
      </div>

      {/* KPI Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { icon: "👥", label: "日活客户数", value: stats.dau.toLocaleString(), trend: stats.dauTrend, sub: "较昨日" },
          { icon: "💰", label: "日消费总额", value: `¥${stats.revenue.toLocaleString()}`, trend: stats.revenueTrend, sub: "较昨日" },
          { icon: "👤", label: "新注册(日)", value: String(stats.newUsers), trend: stats.newUsersTrend, sub: "较昨日" },
          { icon: "📈", label: "平台利润概算", value: `¥${stats.profit.toLocaleString()}`, trend: stats.profitTrend, sub: "较昨日" },
        ].map((k) => (
          <div key={k.label} style={{ background: "#fff", borderRadius: 10, padding: "16px 20px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{k.icon}</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a" }}>{k.value}</div>
            <div style={{ fontSize: 12, color: k.trend > 0 ? "#22c55e" : "#e53935", marginTop: 2 }}>
              {k.trend > 0 ? `↑ ${k.trend}%` : `↓ ${Math.abs(k.trend)}%`} <span style={{ color: "#888" }}>{k.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Second stat row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { icon: "⚠️", label: "余额预警客户数", value: "0", color: "#e53935" },
          { icon: "📉", label: "客户流失率", value: `${stats.churnRate}%` },
          { icon: "👥", label: "月活客户数", value: stats.mau.toLocaleString() },
          { icon: "💰", label: "月消费总额", value: "¥0" },
        ].map((k) => (
          <div key={k.label} style={{ background: "#fff", borderRadius: 10, padding: "16px 20px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{k.icon}</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.color || "#0f172a" }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ color: "#888", fontSize: 13, textAlign: "center", padding: 20 }}>业务数据实时对接中，当前为结构预览</div>
    </div>
  );
}
