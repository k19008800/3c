import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { PageHeader, HelpIcon, SkeletonGroup } from "@3cloud/shared-ui";

/* ───────── 样式 ───────── */

const card: React.CSSProperties = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 12 };

/* ───────── 类型 ───────── */

interface TopCustomer {
  rank: number;
  email: string;
  balance: number;
  avg_daily_cost: number;
  exhaustion_estimate: string; // 日期 / 已耗尽
  health: "healthy" | "watch" | "alert";
  trend: "up" | "flat" | "down";
}
interface AlertRow { email: string; balance: number; avg_daily_cost: number; exhaustion_estimate: string; last_topup: string; }
interface DeclineRow { email: string; this_month: number; last_month: number; decline_pct: number; last_active: string; }
interface TrendPoint { email: string; total: number; days: number[]; }

interface SuccessData {
  tracked_count: number;
  low_balance_count: number;
  declining_count: number;
  renewal_rate: number;
  top: TopCustomer[];
  alerts: AlertRow[];
  declining: DeclineRow[];
  trends: TrendPoint[];
  demo?: boolean;
}

/* 演示数据（对齐原型 admin-customer-success.html 的 mock 分布） */
const MOCK: SuccessData = {
  tracked_count: 128,
  low_balance_count: 23,
  declining_count: 45,
  renewal_rate: 78.5,
  top: [
    { rank: 1, email: "techcorp@example.com", balance: 45200, avg_daily_cost: 3200, exhaustion_estimate: "2026-08-21", health: "healthy", trend: "up" },
    { rank: 2, email: "ailab@example.com", balance: 28600, avg_daily_cost: 2850, exhaustion_estimate: "2026-08-17", health: "healthy", trend: "up" },
    { rank: 3, email: "startup@example.com", balance: 12400, avg_daily_cost: 2100, exhaustion_estimate: "2026-08-13", health: "watch", trend: "flat" },
    { rank: 4, email: "enterprise@example.com", balance: 0, avg_daily_cost: 1800, exhaustion_estimate: "已耗尽", health: "alert", trend: "down" },
    { rank: 5, email: "devteam@example.com", balance: 8600, avg_daily_cost: 1200, exhaustion_estimate: "2026-08-14", health: "watch", trend: "up" },
    { rank: 6, email: "ai-studio@example.com", balance: 15200, avg_daily_cost: 980, exhaustion_estimate: "2026-08-22", health: "healthy", trend: "up" },
    { rank: 7, email: "researcher@example.com", balance: 2300, avg_daily_cost: 760, exhaustion_estimate: "2026-08-10", health: "alert", trend: "down" },
  ],
  alerts: [
    { email: "enterprise@example.com", balance: 0, avg_daily_cost: 1800, exhaustion_estimate: "已耗尽", last_topup: "2026-07-01" },
    { email: "researcher@example.com", balance: 2300, avg_daily_cost: 760, exhaustion_estimate: "3天后", last_topup: "2026-07-15" },
    { email: "lab@example.com", balance: 1800, avg_daily_cost: 420, exhaustion_estimate: "4天后", last_topup: "2026-07-20" },
    { email: "student@example.com", balance: 120, avg_daily_cost: 35, exhaustion_estimate: "3天后", last_topup: "2026-07-28" },
    { email: "hacker@example.com", balance: 580, avg_daily_cost: 180, exhaustion_estimate: "3天后", last_topup: "2026-07-25" },
  ],
  declining: [
    { email: "ailab@example.com", this_month: 12500, last_month: 28600, decline_pct: 56.3, last_active: "2026-08-05" },
    { email: "startup@example.com", this_month: 8200, last_month: 18400, decline_pct: 55.4, last_active: "2026-08-04" },
    { email: "devteam@example.com", this_month: 5600, last_month: 12300, decline_pct: 54.5, last_active: "2026-08-03" },
    { email: "ai-studio@example.com", this_month: 3200, last_month: 6800, decline_pct: 52.9, last_active: "2026-08-02" },
    { email: "enterprise@example.com", this_month: 0, last_month: 15200, decline_pct: 100, last_active: "2026-07-20" },
  ],
  trends: [
    { email: "techcorp@example.com", total: 96000, days: [5, 4, 6, 5, 7, 6, 5, 8, 7, 9, 8, 9, 10, 11, 12, 12, 13, 14, 15, 16, 17, 16, 18, 19, 20, 21, 22, 23, 24, 25] },
    { email: "ailab@example.com", total: 85500, days: [4, 5, 4, 6, 5, 4, 7, 6, 5, 7, 6, 8, 7, 6, 8, 7, 9, 8, 7, 9, 8, 10, 9, 8, 10, 9, 11, 10, 9, 11] },
    { email: "startup@example.com", total: 63000, days: [3, 3, 4, 3, 3, 4, 3, 2, 3, 4, 3, 3, 2, 3, 3, 2, 2, 3, 2, 2, 2, 1, 2, 2, 1, 2, 1, 1, 2, 1] },
    { email: "devteam@example.com", total: 36000, days: [2, 2, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
    { email: "enterprise@example.com", total: 0, days: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  ],
  demo: true,
};

/* ───────── 格式化 ───────── */

function fmtMoney(v: number): string {
  return `¥${v.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}
const HEALTH: Record<string, { dot: string; label: string; color: string }> = {
  healthy: { dot: "#22c55e", label: "健康", color: "#2e7d32" },
  watch:   { dot: "#f59e0b", label: "关注", color: "#e65100" },
  alert:   { dot: "#e53935", label: "预警", color: "#c62828" },
};

/* ───────── 页面 ───────── */

export default function AdminCustomerSuccessPage() {
  const [period, setPeriod] = useState("week");
  const [level, setLevel] = useState("");
  const [keyword, setKeyword] = useState("");

  const q = useQuery({
    queryKey: ["admin-customer-success", period, level, keyword],
    queryFn: async () =>
      (await api.get(`/admin/customer-success?period=${period}&level=${level}&keyword=${keyword}`)).data.data as SuccessData,
    // 后端未实现时立即回退演示数据，避免 404 反复重试导致页面卡加载
    retry: 0,
  });

  // 后端未实现时回退到演示数据（未来接入真实端点后此兜底自动失效）
  const data: SuccessData = q.data?.tracked_count != null ? q.data : MOCK;

  return (
    <>
      <PageHeader title="客户成功看板" help="大客户健康度、余额预警与消费下降趋势追踪，聚焦高价值客户经营。" />
        {/* ── 统计卡 ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 20 }}>
          {[
            { icon: "⭐", label: "追踪中大客户数", value: data.tracked_count, sub: "较上周 ↑ 5", color: "#4f6ef7" },
            { icon: "⚠️", label: "即将耗尽余额客户数", value: data.low_balance_count, sub: "较上周 ↑ 3", color: "#e53935" },
            { icon: "📉", label: "消费下降客户数", value: data.declining_count, sub: "较上周 ↑ 8", color: "#f59e0b" },
            { icon: "💰", label: "本月续费率", value: `${data.renewal_rate}%`, sub: "较上月 ↑ 2.3%", color: "#22c55e" },
          ].map((s, i) => (
            <div key={i} style={{ ...card, borderLeft: `4px solid ${s.color}` }}>
              <div style={{ fontSize: 24 }}>{s.icon}</div>
              <div style={{ fontSize: 12, color: "#888", margin: "6px 0" }}>{s.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* ── 筛选栏 ── */}
        <div style={{ ...card, marginBottom: 20, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {["today", "yesterday", "week", "month"].map(p => (
            <button key={p} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--color-border)",
              background: period === p ? "#4f6ef7" : "#fff", color: period === p ? "#fff" : "#333", cursor: "pointer", fontSize: 12 }}
              onClick={() => setPeriod(p)}>
              {{ today: "今日", yesterday: "昨日", week: "本周", month: "本月" }[p]}
            </button>
          ))}
          <select style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 12 }}
            value={level} onChange={e => setLevel(e.target.value)}>
            <option value="">全部等级</option>
            <option value="high">高价值客户</option>
            <option value="active">活跃客户</option>
            <option value="normal">普通客户</option>
            <option value="dormant">沉寂客户</option>
          </select>
          <input style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", flex: 1, minWidth: 160, fontSize: 12 }}
            placeholder="客户邮箱" value={keyword} onChange={e => setKeyword(e.target.value)} />
          {data.demo && <span style={{ fontSize: 11, color: "#f59e0b" }}>⚠️ 演示数据（后端 /admin/customer-success 待接入）</span>}
        </div>

        {q.isLoading && !q.data ? <SkeletonGroup lines={6} /> : (
          <>
            {/* ── 大客户 Top 20 ── */}
            <div style={card}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>🏆 大客户 Top {data.top.length} 看板 <HelpIcon text="customer_success" /></div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ background: "#f8f9fa" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>排名</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>客户</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>当前余额</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>日均消费</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>预计耗尽日期</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>健康状态</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>消费趋势</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
                </tr></thead>
                <tbody>
                  {data.top.map(c => (
                    <tr key={c.rank} style={{ borderTop: "1px solid #f0f0f0" }}>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ display: "inline-flex", width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center",
                          background: c.rank <= 3 ? "#4f6ef7" : "#eef2ff", color: c.rank <= 3 ? "#fff" : "#4f6ef7", fontWeight: 700, fontSize: 12 }}>{c.rank}</span>
                      </td>
                      <td style={{ padding: "10px 12px", fontWeight: 500 }}>{c.email}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: c.balance <= 0 ? "#e53935" : "#333" }}>{fmtMoney(c.balance)}</td>
                      <td style={{ padding: "10px 12px" }}>{fmtMoney(c.avg_daily_cost)}</td>
                      <td style={{ padding: "10px 12px", color: "#888" }}>{c.exhaustion_estimate}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ color: HEALTH[c.health]!.color }}>
                          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: HEALTH[c.health]!.dot, marginRight: 5 }} />
                          {HEALTH[c.health]!.label}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ color: c.trend === "up" ? "#22c55e" : c.trend === "down" ? "#e53935" : "#9e9e9e" }}>
                          {{ up: "↑", flat: "→", down: "↓" }[c.trend]}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", display: "flex", gap: 4 }}>
                        <button style={{ ...btnBase, background: "#f0f0f0", fontSize: 11 }}>联系</button>
                        <button style={{ ...btnBase, background: "#f0f0f0", fontSize: 11 }}>赠送</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── 余额预警 + 消费下降 ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, margin: "20px 0" }}>
              <div style={card}>
                <div style={{ fontWeight: 600, marginBottom: 12 }}>⚠️ 余额预警列表 <HelpIcon text="customer_success" /></div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ background: "#f8f9fa" }}>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>客户</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>余额</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>日均消费</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>预计耗尽</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>操作</th>
                  </tr></thead>
                  <tbody>
                    {data.alerts.map(a => (
                      <tr key={a.email} style={{ borderTop: "1px solid #f0f0f0" }}>
                        <td style={{ padding: "8px 10px" }}>{a.email}</td>
                        <td style={{ padding: "8px 10px", fontWeight: 700, color: a.balance <= 0 ? "#e53935" : "#f59e0b" }}>{fmtMoney(a.balance)}</td>
                        <td style={{ padding: "8px 10px" }}>{fmtMoney(a.avg_daily_cost)}</td>
                        <td style={{ padding: "8px 10px", color: "#888" }}>{a.exhaustion_estimate}</td>
                        <td style={{ padding: "8px 10px" }}><button style={{ ...btnBase, background: "#4f6ef7", color: "#fff", fontSize: 11 }}>提醒</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={card}>
                <div style={{ fontWeight: 600, marginBottom: 12 }}>📉 消费下降趋势 <HelpIcon text="customer_success" /></div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ background: "#f8f9fa" }}>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>客户</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>本月消费</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>上月消费</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>下降幅度</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>上次活跃</th>
                  </tr></thead>
                  <tbody>
                    {data.declining.map(d => (
                      <tr key={d.email} style={{ borderTop: "1px solid #f0f0f0" }}>
                        <td style={{ padding: "8px 10px" }}>{d.email}</td>
                        <td style={{ padding: "8px 10px" }}>{fmtMoney(d.this_month)}</td>
                        <td style={{ padding: "8px 10px" }}>{fmtMoney(d.last_month)}</td>
                        <td style={{ padding: "8px 10px" }}>
                          <span style={{ padding: "3px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600,
                            background: d.decline_pct >= 55 ? "#fce4ec" : "#fff3e0", color: d.decline_pct >= 55 ? "#c62828" : "#e65100" }}>
                            -{d.decline_pct}%
                          </span>
                        </td>
                        <td style={{ padding: "8px 10px", color: "#888" }}>{d.last_active}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Top 5 大客户近30天消费趋势 ── */}
            <div style={card}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>📈 Top {data.trends.length} 大客户近30天消费趋势 <HelpIcon text="customer_success" /></div>
              {data.trends.map(t => {
                const max = Math.max(...t.days, 1);
                return (
                  <div key={t.email} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                      <span style={{ width: 200 }}>{t.email}</span>
                      <span style={{ color: "#888" }}>{fmtMoney(t.total)}</span>
                    </div>
                    <div style={{ display: "flex", gap: 2, height: 28, alignItems: "flex-end" }}>
                      {t.days.map((d, i) => (
                        <div key={i} style={{ flex: 1, background: "#4f6ef7", borderRadius: "2px 2px 0 0", opacity: 0.25 + 0.75 * (d / max), height: `${(d / max) * 100}%`, minHeight: d > 0 ? 3 : 1 }}
                          title={`Day ${i + 1}: ¥${d}`} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
    </>
  );
}
