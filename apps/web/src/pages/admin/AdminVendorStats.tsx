import { useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import HelpModal from "../../components/HelpModal";

// ── Types ──
interface ModelStat {
  model: string;
  vendor: string;
  users: number;
  calls: number;
  tokens: number;
  cost: number;
  share: number;
  color: string;
}

interface VendorStat {
  vendor: string;
  users: number;
  revenue: number;
  share: number;
  color: string;
}

const MODEL_STATS: ModelStat[] = [
  { model: "DeepSeek-V4", vendor: "DeepSeek", users: 1256, calls: 45890, tokens: 2834000, cost: 1420.5, share: 35.2, color: "#10b981" },
  { model: "GLM-5.2", vendor: "Zhipu AI", users: 890, calls: 32100, tokens: 1892000, cost: 945.8, share: 23.4, color: "#8b5cf6" },
  { model: "Qwen3.5", vendor: "Alibaba", users: 670, calls: 23450, tokens: 1234000, cost: 617.2, share: 15.3, color: "#2563eb" },
  { model: "Kimi-K2.5", vendor: "Moonshot", users: 520, calls: 18900, tokens: 987000, cost: 493.5, share: 12.2, color: "#f59e0b" },
  { model: "GPT-5.4", vendor: "OpenAI", users: 340, calls: 12300, tokens: 654000, cost: 327.1, share: 8.1, color: "#ec4899" },
  { model: "Claude-4.5", vendor: "Anthropic", users: 210, calls: 7800, tokens: 432000, cost: 216.2, share: 5.8, color: "#6366f1" },
];

const VENDOR_STATS: VendorStat[] = [
  { vendor: "DeepSeek", users: 1256, revenue: 2130.8, share: 38.2, color: "#10b981" },
  { vendor: "Zhipu AI", users: 890, revenue: 1418.7, share: 25.4, color: "#8b5cf6" },
  { vendor: "Alibaba", users: 670, revenue: 925.8, share: 16.6, color: "#2563eb" },
  { vendor: "Moonshot", users: 520, revenue: 740.3, share: 13.3, color: "#f59e0b" },
  { vendor: "OpenAI", users: 340, revenue: 327.1, share: 4.5, color: "#ec4899" },
  { vendor: "Anthropic", users: 210, revenue: 216.2, share: 2.0, color: "#6366f1" },
];

// SVG Donut chart
function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  const r = 40;
  const cx = 50;
  const cy = 50;
  const strokeWidth = 12;

  let cumulative = 0;
  const slices = data.map((d) => {
    const pct = total > 0 ? d.value / total : 0;
    const startAngle = (cumulative / total) * 2 * Math.PI;
    const endAngle = ((cumulative + d.value) / total) * 2 * Math.PI;
    cumulative += d.value;

    const x1 = cx + r * Math.sin(startAngle);
    const y1 = cy - r * Math.cos(startAngle);
    const x2 = cx + r * Math.sin(endAngle);
    const y2 = cy - r * Math.cos(endAngle);
    const largeArc = pct > 0.5 ? 1 : 0;

    return {
      d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`,
      color: d.color,
      pct,
      label: d.label,
      value: d.value,
    };
  });

  return (
    <svg viewBox="0 0 100 100" style={{ width: "100%", maxWidth: 220 }}>
      {slices.map((s, i) => (
        <path key={i} d={s.d} fill={s.color} stroke="#fff" strokeWidth="0.5">
          <title>{s.label}: {s.value} ({(s.pct * 100).toFixed(1)}%)</title>
        </path>
      ))}
      <circle cx={cx} cy={cy} r={r - strokeWidth} fill="#fff" />
    </svg>
  );
}

export default function AdminVendorStats() {
  const totalUsers = MODEL_STATS.reduce((a, b) => a + b.users, 0);
  const totalCalls = MODEL_STATS.reduce((a, b) => a + b.calls, 0);
  const totalRevenue = VENDOR_STATS.reduce((a, b) => a + b.revenue, 0);

  return (
    <AdminLayout>
      <h1 className="page-title">
        用户选购统计
        <HelpModal title="用户选购统计">
          <p>统计用户对各 AI 模型和供应商的选购情况。</p>
          <p style={{ marginTop: 8 }}>
            展示各模型的用户数、调用量、Token 消耗和费用占比（饼图），
            以及各供应商的市场份额和收入贡献。
          </p>
        </HelpModal>
      </h1>
      <p className="page-subtitle">模型选购分布与供应商份额分析</p>

      {/* Stats */}
      <div className="stats-grid">
        {[
          { l: "选购用户总数", v: totalUsers.toLocaleString() },
          { l: "总调用次数", v: totalCalls.toLocaleString() },
          { l: "总营收", v: `¥${totalRevenue.toFixed(1)}` },
          { l: "使用模型数", v: String(MODEL_STATS.length) + " 个" },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ cursor: "default" }}>
            <div className="stat-card-label">{s.l}</div>
            <div className="stat-card-value">{s.v}</div>
          </div>
        ))}
      </div>

      {/* Pie Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Model Distribution */}
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">
            <span>🍩 模型选购分布</span>
          </div>
          <div className="panel-body" style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <div style={{ flexShrink: 0 }}>
              <DonutChart data={MODEL_STATS.map((m) => ({ label: m.model, value: m.users, color: m.color }))} />
            </div>
            <div style={{ flex: 1 }}>
              <table className="data-table" style={{ fontSize: 11 }}>
                <thead>
                  <tr><th>模型</th><th style={{ textAlign: "right" }}>用户</th><th style={{ textAlign: "right" }}>占比</th></tr>
                </thead>
                <tbody>
                  {MODEL_STATS.map((m) => (
                    <tr key={m.model}>
                      <td>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: m.color, marginRight: 4 }} />
                        {m.model}
                      </td>
                      <td style={{ textAlign: "right" }}>{m.users.toLocaleString()}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{m.share.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Vendor Share */}
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">
            <span>💼 供应商份额占比</span>
          </div>
          <div className="panel-body" style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <div style={{ flexShrink: 0 }}>
              <DonutChart data={VENDOR_STATS.map((v) => ({ label: v.vendor, value: v.revenue, color: v.color }))} />
            </div>
            <div style={{ flex: 1 }}>
              <table className="data-table" style={{ fontSize: 11 }}>
                <thead>
                  <tr><th>供应商</th><th style={{ textAlign: "right" }}>收入</th><th style={{ textAlign: "right" }}>份额</th></tr>
                </thead>
                <tbody>
                  {VENDOR_STATS.map((v) => (
                    <tr key={v.vendor}>
                      <td>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: v.color, marginRight: 4 }} />
                        {v.vendor}
                      </td>
                      <td style={{ textAlign: "right" }}>¥{v.revenue.toFixed(1)}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{v.share.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Model Detail Table */}
      <div className="panel">
        <div className="panel-header">
          <span>📋 模型选购明细</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>模型</th>
                <th>供应商</th>
                <th>选购用户</th>
                <th>调用次数</th>
                <th>Token 消耗</th>
                <th>费用</th>
                <th>用户占比</th>
                <th>费用占比</th>
              </tr>
            </thead>
            <tbody>
              {MODEL_STATS.map((m, i) => (
                <tr key={m.model}>
                  <td>{i + 1}</td>
                  <td>
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: m.color, marginRight: 6 }} />
                    {m.model}
                  </td>
                  <td>{m.vendor}</td>
                  <td>{m.users.toLocaleString()}</td>
                  <td>{m.calls.toLocaleString()}</td>
                  <td>{m.tokens.toLocaleString()}</td>
                  <td className="text-mono">¥{m.cost.toFixed(2)}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 60, height: 4, background: "var(--color-border)", borderRadius: 2 }}>
                        <div style={{ width: `${(m.users / totalUsers * 100)}%`, height: "100%", background: m.color, borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 11 }}>{((m.users / totalUsers) * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="text-mono" style={{ fontWeight: 600 }}>{m.share.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
