import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { useNavigate } from "react-router-dom";
import { HelpIcon, SkeletonGroup } from "@3cloud/shared-ui";
import { useI18n } from "../lib/i18n-context";
import { fmtNumber, fmtMoney } from "../lib/fmt";
import "./dashboard.css";

/* ============ 类型 ============ */
interface Stats {
  balance: number;
  monthlyCost: number;
  todayCalls: number;
  activeKeys: number;
  totalKeys: number;
  todayCallCount: number;
  todayTokenUsage: number;
  todayCost: number;
  estimatedDays: number;
}

interface DistItem {
  color: string;
  name: string;
  percentage: number;
  calls: string;
  tokens: string;
}

interface RecentCall {
  time: string;
  model: string;
  tokens: string;
  cost: string;
  success: boolean;
}

/* ============ 内联 SVG 图标（替代 emoji） ============ */
function IconChart() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-6" /></svg>);
}
function IconClock() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
}
function IconWallet() {
  return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M16 12h2" /></svg>);
}
function IconKey() {
  return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="4" /><path d="M11 11l8 8M16 16l2-2M19 19l1.5-1.5" /></svg>);
}
function IconLogs() {
  return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16M4 10h16M4 15h10M4 20h7" /></svg>);
}
function IconTicket() {
  return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8Z" /><path d="M13 6v12" strokeDasharray="2 2" /></svg>);
}

/* ============ 简单趋势图（纯 SVG，不依赖 Chart.js） ============ */
function TrendChart({
  models,
}: {
  data: { labels: string[]; datasets: { label: string; data: number[]; color: string; dashed: boolean; hidden: boolean }[] };
  models: { name: string; color: string; visible: boolean }[];
}) {
  const { t } = useI18n();
  const [activeModels, setActiveModels] = useState<Set<number>>(
    new Set(models.map((_, i) => i))
  );

  const toggleModel = (idx: number) => {
    setActiveModels((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {models.map((m, i) => (
          <button
            key={m.name}
            onClick={() => toggleModel(i)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 999,
              border: `1.5px solid ${activeModels.has(i) ? m.color : "var(--color-border)"}`,
              background: activeModels.has(i) ? "var(--color-panel)" : "var(--color-divider-light)",
              color: activeModels.has(i) ? "var(--color-text)" : "var(--color-text-muted)",
              fontSize: 12,
              cursor: "pointer",
              transition: "opacity .15s",
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
            {m.name}
          </button>
        ))}
      </div>
      {/* 后端缺失：趋势图数据接口 /me/stats/trend */}
      <div style={{ textAlign: "center", padding: 20, color: "var(--color-text-muted)", fontSize: 13 }}>
        {t("dashboard.trend.missingBackend")}（/me/stats/trend）
      </div>
    </div>
  );
}

/* ============ 组件 ============ */
export default function DashboardPage() {
  const navigate = useNavigate();
  const { t } = useI18n();

  /* 使用真实 API 获取统计数据 */
  const { data, isLoading } = useQuery<Stats>({
    queryKey: ["me-stats"],
    queryFn: async () => (await api.get<Stats>("/me/stats")).data,
    refetchInterval: 15000,
  });

  /* 子卡片数据（label 走 i18n，仅显示层格式化；环比数据后端缺失保留占位文案） */
  const subs = [
    { label: t("dashboard.subs.todayCalls"), value: data?.todayCallCount != null ? fmtNumber(data.todayCallCount) : "...", sub: t("dashboard.subs.successRate", { rate: (data?.todayCalls ?? 0) > 0 ? "96.7%" : "—" }) },
    { label: t("dashboard.subs.tokenUsage"), value: data?.todayTokenUsage ? `${(data.todayTokenUsage / 10000).toFixed(1)}万` : "...", sub: "↑ 输入 · ↓ 输出" },
    { label: t("dashboard.subs.todayCost"), value: data?.todayCost != null ? fmtMoney(data.todayCost) : "...", sub: "环比 +12.3%" /* 后端缺失：环比数据 */ },
    { label: t("dashboard.subs.balance"), value: data?.balance != null ? fmtMoney(data.balance) : "...", sub: data?.estimatedDays != null ? t("dashboard.subs.estimatedDays", { days: String(data.estimatedDays) }) : "—" },
  ];

  /* 模型分布 mock（后端缺失 /me/stats/model-distribution）—— 克制色板：信号蓝/成功绿/警告橙/中性灰 */
  const distData: DistItem[] = [
    { color: "#1896FF", name: "DeepSeek V4 Flash", percentage: 52, calls: "6,542", tokens: "2.1M" },
    { color: "#0B7A4B", name: "GLM-5-Pro", percentage: 26, calls: "3,210", tokens: "1.5M" },
    { color: "#B45D09", name: "Qwen 3.6 Plus", percentage: 15, calls: "1,876", tokens: "0.8M" },
    { color: "#8B99AC", name: "其他模型", percentage: 7, calls: "717", tokens: "0.3M" },
  ];

  /* 最近调用 mock（后端缺失 /me/stats/recent-calls） */
  const recentCalls: RecentCall[] = [
    { time: "14:30", model: "DeepSeek V4 Flash", tokens: "45K", cost: "¥0.9000", success: true },
    { time: "14:29", model: "GLM-5-Pro", tokens: "12K", cost: "¥0.3000", success: true },
    { time: "14:28", model: "Qwen 3.6 Plus", tokens: "8K", cost: "¥0.1500", success: true },
    { time: "14:25", model: "DeepSeek V4 Flash", tokens: "2K", cost: "¥0.0400", success: false },
  ];

  /* 趋势图模型定义 —— 克制色板，去紫/粉 */
  const trendModels = [
    { name: "Qwen3.5-397B", color: "#1896FF", visible: true },
    { name: "GLM-5.2", color: "#0B7A4B", visible: true },
    { name: "DeepSeek-V4", color: "#B45D09", visible: true },
    { name: "Kimi-K2.5", color: "#8B99AC", visible: true },
    { name: "GPT-5.4", color: "#0B6FD6", visible: true },
  ];

  if (isLoading) {
    return (
      <div style={{ padding: "4px 0" }}>
        <h2 style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 8, fontSize: 20, fontWeight: 600 }}>
          {t("dashboard.title")}
          <HelpIcon text={t("dashboard.help.overview")} level="page" />
        </h2>
        <SkeletonGroup lines={5} />
      </div>
    );
  }

  const cardBase: React.CSSProperties = {
    background: "var(--color-panel)",
    borderRadius: "var(--radius-lg)",
    border: "1px solid var(--color-divider)",
    boxShadow: "var(--shadow-panel)",
  };

  return (
    <div style={{ padding: "4px 0" }}>
      {/* 页面标题 */}
      <h2 style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 22, fontWeight: 700, color: "var(--color-text)" }}>
        {t("dashboard.title")}
        <HelpIcon text={t("dashboard.help.overviewDetail")} level="page" />
      </h2>

      {/* ===== 4 张概览卡片 ===== */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }} className="dash-grid">
        {/* 账户余额 */}
        <div
          onClick={() => navigate("/recharge")}
          className="dash-stat dash-stat--clickable"
          style={{ ...cardBase, padding: "16px 20px", cursor: "pointer" }}
        >
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6 }}>{t("dashboard.balance")}</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text)", fontFamily: "var(--font-family-mono)" }}>{fmtMoney(data?.balance ?? 0)}</div>
          <div style={{ fontSize: 12, color: "var(--color-primary)", marginTop: 6, fontWeight: 500 }}>{t("dashboard.rechargeNow")} →</div>
        </div>

        {/* 本月消费 */}
        <div
          onClick={() => navigate("/logs")}
          className="dash-stat dash-stat--clickable"
          style={{ ...cardBase, padding: "16px 20px", cursor: "pointer" }}
        >
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6 }}>{t("dashboard.monthlyCost")}</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text)", fontFamily: "var(--font-family-mono)" }}>{fmtMoney(data?.monthlyCost ?? 0)}</div>
          <div style={{ fontSize: 12, color: "var(--color-primary)", marginTop: 6, fontWeight: 500 }}>{t("dashboard.viewDetail")} →</div>
        </div>

        {/* 今日调用 */}
        <div className="dash-stat" style={{ ...cardBase, padding: "16px 20px" }}>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6 }}>{t("dashboard.todayCalls")}</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text)", fontFamily: "var(--font-family-mono)" }}>{fmtNumber(data?.todayCalls ?? 0)}</div>
        </div>

        {/* 活跃 API Key */}
        <div
          onClick={() => navigate("/api-keys")}
          className="dash-stat dash-stat--clickable"
          style={{ ...cardBase, padding: "16px 20px", cursor: "pointer" }}
        >
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6 }}>{t("dashboard.activeKeys")}</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text)", fontFamily: "var(--font-family-mono)" }}>{data?.activeKeys ?? "—"} / {data?.totalKeys ?? "—"}</div>
          <div style={{ fontSize: 12, color: "var(--color-primary)", marginTop: 6, fontWeight: 500 }}>{t("dashboard.manageKeys")} →</div>
        </div>
      </div>

      {/* ===== 模型 Token 消耗曲线面板 ===== */}
      <div style={{ ...cardBase, marginBottom: 16, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid var(--color-divider)" }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
            <IconChart /> {t("dashboard.trend.title")}
          </h3>
          <div style={{ display: "flex", gap: 4, background: "var(--color-divider-light)", borderRadius: 6, padding: 2 }}>
            {["dashboard.trend.today", "dashboard.trend.yesterday", "dashboard.trend.week", "dashboard.trend.lastMonth"].map((tKey) => (
              <button
                key={tKey}
                className={`dash-trend-btn ${tKey === "dashboard.trend.today" ? "dash-trend-btn--active" : ""}`}
              >
                {t(tKey)}
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: "16px 20px" }}>
          {/* 4 个子统计卡片 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }} className="dash-sub-grid">
            {subs.map((s, i) => (
              <div key={i} style={{
                background: i === 3 ? "var(--color-warning-bg)" : "var(--color-primary-lighter)",
                borderRadius: 6, padding: "10px 12px",
              }}>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: i === 3 ? "var(--color-warning-text)" : "var(--color-text)", fontFamily: "var(--font-family-mono)" }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* 趋势图 */}
          <TrendChart
            data={{
              labels: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`),
              datasets: [],
            }}
            models={trendModels}
          />

          {/* 时间滑块 */}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--color-divider)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "var(--color-text-muted)", marginBottom: 6 }}>
              <span>00:00</span>
              <span style={{ color: "var(--color-primary)", fontWeight: 600 }}>{t("dashboard.trend.selected", { range: "00:00 — 23:59（24小时）" })}</span>
              <span>23:59</span>
            </div>
            <div style={{ position: "relative", height: 28, background: "var(--color-divider-light)", borderRadius: 6, cursor: "grab" }}>
              <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: "100%", background: "var(--color-primary-lighter)", borderRadius: 6 }} />
              <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: 8, background: "var(--color-primary)", borderRadius: 6 }} />
              <div style={{ position: "absolute", top: 0, right: 0, height: "100%", width: 8, background: "var(--color-primary)", borderRadius: 6 }} />
            </div>
          </div>
        </div>
      </div>

      {/* ===== 底部双列：模型分布 + 最近消费 ===== */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }} className="dash-dual">
        {/* 模型调用分布 */}
        <div style={{ ...cardBase, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid var(--color-divider)" }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text)", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <IconChart /> {t("dashboard.distribution.title")}
            </h3>
            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{t("dashboard.distribution.recentHour")}</span>
          </div>
          <div style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {distData.map((d) => (
                <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, width: 150, flexShrink: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
                    <span style={{ color: "var(--color-text)" }}>{d.name}</span>
                  </div>
                  <div style={{ flex: 1, height: 6, background: "var(--color-divider-light)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${d.percentage}%`, background: d.color, borderRadius: 3 }} />
                  </div>
                  <div style={{ width: 180, textAlign: "right", color: "var(--color-text-muted)", flexShrink: 0, fontFamily: "var(--font-family-mono)" }}>
                    {t("dashboard.distribution.callsTokens", { calls: d.calls, tokens: d.tokens })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 最近消费 */}
        <div style={{ ...cardBase, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid var(--color-divider)" }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text)", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <IconClock /> {t("dashboard.recent.title")}
            </h3>
            <span style={{ fontSize: 11, color: "var(--color-primary)", cursor: "pointer", fontWeight: 500 }} onClick={() => navigate("/logs")}>
              {t("dashboard.recent.viewAll")} →
            </span>
          </div>
          <div style={{ padding: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--color-table-header-bg)" }}>
                  <th style={{ textAlign: "left", padding: "10px 14px", borderBottom: "1px solid var(--color-divider)", color: "var(--color-text-secondary)", fontWeight: 500, fontSize: 12 }}>{t("common.time")}</th>
                  <th style={{ textAlign: "left", padding: "10px 14px", borderBottom: "1px solid var(--color-divider)", color: "var(--color-text-secondary)", fontWeight: 500, fontSize: 12 }}>{t("common.model")}</th>
                  <th style={{ textAlign: "left", padding: "10px 14px", borderBottom: "1px solid var(--color-divider)", color: "var(--color-text-secondary)", fontWeight: 500, fontSize: 12 }}>{t("common.token")}</th>
                  <th style={{ textAlign: "left", padding: "10px 14px", borderBottom: "1px solid var(--color-divider)", color: "var(--color-text-secondary)", fontWeight: 500, fontSize: 12 }}>{t("common.cost")}</th>
                  <th style={{ textAlign: "left", padding: "10px 14px", borderBottom: "1px solid var(--color-divider)", color: "var(--color-text-secondary)", fontWeight: 500, fontSize: 12 }}>{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {recentCalls.map((call, i) => (
                  <tr key={i} style={{ cursor: "pointer" }}>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-divider-light)", color: "var(--color-text)", fontFamily: "var(--font-family-mono)", fontSize: 12 }}>{call.time}</td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-divider-light)", color: "var(--color-text)" }}>{call.model}</td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-divider-light)", color: "var(--color-text)", fontFamily: "var(--font-family-mono)", fontSize: 12 }}>{call.tokens}</td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-divider-light)", color: "var(--color-text)", fontFamily: "var(--font-family-mono)", fontSize: 12 }}>{call.cost}</td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-divider-light)" }}>
                      <span style={{ color: call.success ? "var(--color-success-text)" : "var(--color-danger-text)", fontWeight: 500, fontSize: 12 }}>
                        {call.success ? `✓ ${t("common.success")}` : `✗ ${t("common.failed")}(401)`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ===== 快捷入口 ===== */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }} className="dash-quick-grid">
        {[
          { icon: <IconWallet />, label: t("dashboard.quick.recharge"), to: "/recharge" },
          { icon: <IconKey />, label: t("dashboard.quick.createKey"), to: "/api-keys" },
          { icon: <IconLogs />, label: t("dashboard.quick.logs"), to: "/logs" },
          { icon: <IconTicket />, label: t("dashboard.quick.ticket"), to: "/tickets" },
        ].map((item) => (
          <div
            key={item.label}
            onClick={() => navigate(item.to)}
            className="dash-quick"
            style={{
              ...cardBase,
              padding: "18px 12px",
              textAlign: "center",
              cursor: "pointer",
              fontSize: 13,
              color: "var(--color-text-secondary)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>{item.icon}</div>
            {item.label}
          </div>
        ))}
      </div>

      {/* 响应式：窄屏塌缩 */}
      <style>{`
        @media (max-width: 1100px) {
          .dash-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .dash-dual { grid-template-columns: 1fr !important; }
          .dash-sub-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .dash-quick-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
