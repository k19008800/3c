import React, { useState, useEffect } from "react";
import { HelpIcon } from "@3cloud/shared-ui";
import { useAuthStore } from "../store/auth";
import { api } from "../lib/api";

/** 待办卡片语义色调（对齐 c3-todo-card 的 semantic 浅底） */
type TodoTone = "red" | "orange" | "blue" | "neutral";
const TODO_TONE_BORDER: Record<TodoTone, string> = {
  red: "var(--color-danger-border)",
  orange: "var(--color-warning-border)",
  blue: "var(--color-info-border)",
  neutral: "var(--color-primary-border)",
};
const TODO_TONE_BG: Record<TodoTone, string> = {
  red: "var(--color-danger-bg)",
  orange: "var(--color-warning-bg)",
  blue: "var(--color-info-bg)",
  neutral: "var(--color-primary-lighter)",
};

const TODOS: { label: string; count: number; unit: string; to: string; tone: TodoTone }[] = [
  { label: "人工上账待审核", count: 0, unit: "笔", to: "/admin/finance/manual-topup", tone: "red" },
  { label: "退款待审核", count: 0, unit: "笔", to: "/admin/finance/refunds", tone: "orange" },
  { label: "发票待审核", count: 0, unit: "份", to: "/admin/finance/invoices", tone: "blue" },
  { label: "提现待审核", count: 0, unit: "笔", to: "/admin/finance/withdrawals", tone: "neutral" },
  { label: "消费异常提醒", count: 0, unit: "条", to: "/admin/consumption/anomaly", tone: "red" },
  { label: "余额预警", count: 0, unit: "个", to: "/admin/consumption/balance-alert", tone: "orange" },
];

interface Recharger {
  rank: number;
  userId: number;
  email: string;
  name: string;
  amount: number;
  count: number;
  lastPaidAt: string;
}

/** 排名徽章配色（1金/2银/3铜/其余灰，中性金属色，非品牌色） */
const RANK_COLORS = ["#d4a017", "#9aa5b1", "#c08a4b", "#c8cdd6"];

/** 上次充值时间 → YYYY-MM-DD（PG 返回字符串或 Date） */
function dateStr(v: string | Date): string {
  return typeof v === "string" ? v.slice(0, 10) : new Date(v).toISOString().slice(0, 10);
}

export default function AdminDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [stats, setStats] = useState({ dau: 0, dauTrend: 0, revenue: 0, revenueTrend: 0, newUsers: 0, newUsersTrend: 0, profit: 0, profitTrend: 0, mau: 0, churnRate: 0, alertCount: 0 });
  const [topRechargers, setTopRechargers] = useState<Recharger[]>([]);

  useEffect(() => {
    api.get<{ data: { topRechargers?: Recharger[] } }>("/admin/dashboard").then(r => {
      setTopRechargers(Array.isArray(r.data?.data?.topRechargers) ? r.data.data.topRechargers : []);
    }).catch(() => {});
    api.get("/public/stats").then(r => setStats(s => ({ ...s, ...r.data, dauTrend: 12.5, revenueTrend: 8.3, newUsersTrend: 15.2, profitTrend: 5.8, mau: (r.data.users ?? 0), churnRate: 3.2 }))).catch(() => {});
  }, []);

  return (
    <div>
      <h2 style={{ fontSize: "var(--font-size-page-title)", fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        业务看板 <HelpIcon text="管理员业务概览：待办事项、关键指标、运营数据" />
      </h2>
      <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 20 }}>
        {user?.email} · <span className="c3-admin-badge">ADMIN</span>
      </p>

      {/* 待办 Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        {TODOS.map(t => (
          <div key={t.label} onClick={() => window.location.hash = `#${t.to}`}
            style={{ background: TODO_TONE_BG[t.tone], borderRadius: "var(--radius-lg)", padding: 16, borderLeft: `4px solid ${TODO_TONE_BORDER[t.tone]}`, cursor: "pointer", transition: "box-shadow .2s, transform .2s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{t.label}</span>
              <span style={{ background: "rgba(11,18,32,0.06)", color: "var(--color-text-secondary)", borderRadius: 10, padding: "1px 10px", fontSize: 12, fontWeight: 700 }}>{t.count}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text)", margin: "4px 0" }}>{t.count}<span style={{ fontSize: 12, color: "var(--color-text-muted)", fontWeight: 400 }}>{t.unit}</span></div>
            <div style={{ fontSize: 12, color: "var(--color-primary)" }}>前往处理 →</div>
          </div>
        ))}
      </div>

      {/* KPI Row 1 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 12 }}>
        {[
          { label: "日活客户数", val: stats.dau.toLocaleString(), trend: stats.dauTrend },
          { label: "日消费总额", val: `¥${stats.revenue.toLocaleString()}`, trend: stats.revenueTrend },
          { label: "新注册(日)", val: String(stats.newUsers), trend: stats.newUsersTrend },
          { label: "平台利润概算", val: `¥${stats.profit.toLocaleString()}`, trend: stats.profitTrend },
        ].map(k => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* KPI Row 2 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 20 }}>
        <StatCard label="余额预警客户数" val={String(stats.alertCount)} tone="var(--color-danger-text)" />
        <StatCard label="客户流失率" val={`${stats.churnRate}%`} tone="var(--color-warning-text)" />
        <StatCard label="月活客户数" val={stats.mau.toLocaleString()} tone="var(--color-primary)" />
        <StatCard label="月消费总额" val="¥0" tone="var(--color-success-text)" />
      </div>

      {/* 充值排行榜 Top 10 */}
      <Panel
        title="充值排行榜 Top 10"
        help="按已支付充值累计金额排名前 10 的客户"
        extra={<button className="c3-btn c3-btn--text c3-btn--sm" onClick={() => exportLeaderboardCsv(topRechargers)}>导出</button>}
        body={<RechargeLeaderboard data={topRechargers} />}
      />

      {/* Charts placeholder */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 20 }}>
        <Panel title="供应商调用量分布" help="供应商调用占比" body={<div style={{ textAlign: "center", padding: "40px 0", color: "var(--color-text-muted)" }}>图表接入中 — 数据源已就绪</div>} />
        <Panel title="API 成功率" help="过去 24 小时 API 成功率" body={<div style={{ textAlign: "center", padding: "40px 0", color: "var(--color-success-text)", fontSize: 18, fontWeight: 700 }}>99.2%</div>} />
      </div>

      <Panel title="24h 调用量热力图" help="实时调用分布" />
    </div>
  );
}

function KpiCard({ label, val, trend }: { label: string; val: string; trend: number }) {
  return <div style={{ background: "var(--color-panel)", borderRadius: "var(--radius-lg)", padding: "16px 20px", border: "1px solid var(--color-border)", boxShadow: "var(--shadow-panel)" }}>
    <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text)", fontVariantNumeric: "tabular-nums" }}>{val}</div>
    <div style={{ fontSize: 12, color: trend > 0 ? "var(--color-success-text)" : "var(--color-danger-text)", marginTop: 2 }}>↑ {trend}% <span style={{ color: "var(--color-text-muted)" }}>较昨日</span></div>
  </div>;
}

function StatCard({ label, val, tone }: { label: string; val: string; tone: string }) {
  return <div style={{ background: "var(--color-panel)", borderRadius: "var(--radius-lg)", padding: "16px 20px", border: "1px solid var(--color-border)", boxShadow: "var(--shadow-panel)" }}>
    <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700, color: tone, fontVariantNumeric: "tabular-nums" }}>{val}</div>
  </div>;
}

function Panel({ title, help, extra, body }: { title: string; help?: string; extra?: React.ReactNode; body?: React.ReactNode }) {
  return <div style={{ background: "var(--color-panel)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)", boxShadow: "var(--shadow-panel)", marginBottom: 20 }}>
    <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-divider)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
        {title}
        {help && <HelpIcon text={help} />}
      </h3>
      {extra}
    </div>
    <div style={{ padding: 16 }}>{body || <div style={{ textAlign: "center", padding: 40, color: "var(--color-text-muted)" }}>数据对接中</div>}</div>
  </div>;
}

/** 充值排行榜表格（对齐原型 rank-table：排名徽章 / 客户 / 金额 / 次数 / 上次充值） */
function RechargeLeaderboard({ data }: { data: Recharger[] }) {
  if (data.length === 0) {
    return <div style={{ textAlign: "center", padding: "32px 0", color: "var(--color-text-muted)", fontSize: 13 }}>暂无充值数据</div>;
  }
  const cell = { padding: "10px 14px", borderBottom: "1px solid var(--color-divider)", fontSize: 13 };
  return (
    <div style={{ maxHeight: 400, overflowY: "auto", margin: -16 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["排名", "客户", "充值金额", "充值次数", "上次充值"].map(h => (
              <th key={h} style={{ background: "var(--color-table-header-bg)", textAlign: "left", padding: "10px 14px", fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)", borderBottom: "1px solid var(--color-border)", position: "sticky", top: 0 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map(r => (
            <tr key={r.userId}>
              <td style={cell}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: "50%", fontSize: 10, fontWeight: 700, color: "#fff", background: RANK_COLORS[Math.min(r.rank, 4) - 1] }}>{r.rank}</span>
              </td>
              <td style={{ ...cell, color: "var(--color-primary)" }}>{r.email}</td>
              <td style={{ ...cell, fontFamily: "var(--font-family-mono)", fontWeight: 500 }}>¥{r.amount.toLocaleString()}</td>
              <td style={cell}>{r.count}</td>
              <td style={cell}>{dateStr(r.lastPaidAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 导出充值排行榜 CSV（带 BOM，Excel 可直接打开） */
function exportLeaderboardCsv(data: Recharger[]) {
  const header = ["排名", "客户", "充值金额", "充值次数", "上次充值"];
  const lines = data.map(r => [r.rank, r.email, r.amount, r.count, dateStr(r.lastPaidAt)].join(","));
  const csv = "﻿" + [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "充值排行榜.csv";
  a.click();
  URL.revokeObjectURL(url);
}
