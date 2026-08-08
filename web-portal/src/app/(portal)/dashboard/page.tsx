"use client";

import React, { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HelpIcon } from "@3cloud/shared-ui";
import { Chart } from "chart.js/auto";

// ===== Model Definitions =====
const MODELS = [
  { id: "qwen3.5-397b", name: "Qwen3.5-397B", color: "#2563eb" },
  { id: "glm-5.2", name: "GLM-5.2", color: "#8b5cf6" },
  { id: "deepseek-v4", name: "DeepSeek-V4", color: "#10b981" },
  { id: "kimi-k2.5", name: "Kimi-K2.5", color: "#f59e0b" },
  { id: "gpt-5.4", name: "GPT-5.4", color: "#ec4899" },
];

const HOURS = 24;
const labels = Array.from({ length: HOURS }, (_, i) => `${String(i).padStart(2, "0")}:00`);

interface ModelEntry {
  id: string; name: string; color: string;
  data: { up: number[]; down: number[] };
  visible: boolean;
}

function genData(idx: number) {
  const up: number[] = [], down: number[] = [];
  for (let h = 0; h < HOURS; h++) {
    const base = idx * 200 + (h >= 8 && h <= 22 ? 600 : 100);
    const v = Math.random() * 400;
    up.push(Math.round(base + v));
    down.push(Math.round((base + v) * (2 + Math.random() * 2)));
  }
  return { up, down };
}

const distributionData = [
  { color: "#6a8aff", name: "DeepSeek V4 Flash", pct: 52, calls: "6,542", tokens: "2.1M" },
  { color: "#22c55e", name: "GLM-5-Pro", pct: 26, calls: "3,210", tokens: "1.5M" },
  { color: "#f59e0b", name: "Qwen 3.6 Plus", pct: 15, calls: "1,876", tokens: "0.8M" },
  { color: "#a78bfa", name: "其他模型", pct: 7, calls: "717", tokens: "0.3M" },
];

const recentData = [
  { time: "14:30", model: "DeepSeek V4 Flash", tokens: "45K", cost: "¥0.9000", ok: true },
  { time: "14:29", model: "GLM-5-Pro", tokens: "12K", cost: "¥0.3000", ok: true },
  { time: "14:28", model: "Qwen 3.6 Plus", tokens: "8K", cost: "¥0.1500", ok: true },
  { time: "14:25", model: "DeepSeek V4 Flash", tokens: "2K", cost: "¥0.0400", ok: false },
];

export default function DashboardPage() {
  const router = useRouter();
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstRef = useRef<Chart | null>(null);
  const [models, setModels] = useState<ModelEntry[]>(() =>
    MODELS.map((m, i) => ({ ...m, data: genData(i), visible: true }))
  );
  const [sl, setSl] = useState(0);
  const [sr, setSr] = useState(100);
  const dragRef = useRef<"left" | "right" | "fill" | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const updateChart = () => {
    if (!chartRef.current) return;
    const ctx = chartRef.current.getContext("2d");
    if (!ctx) return;
    if (chartInstRef.current) chartInstRef.current.destroy();

    const ds: any[] = [];
    models.forEach((m) => {
      ds.push({
        label: `${m.name} ↑`, data: m.data.up, borderColor: m.color,
        backgroundColor: m.color + "15", borderWidth: 2, pointRadius: 1.5,
        pointHoverRadius: 6, pointHoverBackgroundColor: m.color,
        pointHoverBorderColor: "#fff", pointHoverBorderWidth: 2,
        tension: 0.35, fill: false, hidden: !m.visible,
      });
      ds.push({
        label: `${m.name} ↓`, data: m.data.down, borderColor: m.color,
        backgroundColor: m.color + "10", borderWidth: 2, borderDash: [6, 3],
        pointRadius: 1, pointHoverRadius: 5, pointHoverBackgroundColor: m.color,
        pointHoverBorderColor: "#fff", pointHoverBorderWidth: 2,
        tension: 0.35, fill: false, hidden: !m.visible,
      });
    });

    chartInstRef.current = new Chart(ctx, {
      type: "line",
      data: { labels, datasets: ds },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(15,23,42,0.94)", titleFont: { size: 12, weight: "bold" as const },
            bodyFont: { size: 11 }, padding: 12, cornerRadius: 8,
            borderColor: "rgba(255,255,255,0.12)", borderWidth: 1,
            titleColor: "#f8fafc", bodyColor: "#e2e8f0", caretPadding: 8, boxPadding: 4,
            callbacks: {
              title(items: any) { return items[0]?.label || ""; },
              label(ctx: any) {
                const v = ctx.parsed.y;
                return ` ${ctx.dataset.label}  ${v.toLocaleString()} tokens`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false }, ticks: { font: { size: 10 }, color: "#64748b", maxTicksLimit: 12 },
            min: `${String(Math.round((sl / 100) * 23)).padStart(2, "0")}:00`,
            max: `${String(Math.round((sr / 100) * 23)).padStart(2, "0")}:00`,
          },
          y: {
            position: "left", grid: { color: "rgba(100,116,139,0.2)" },
            ticks: { font: { size: 10 }, color: "#64748b", callback(v: any) {
              if (v >= 10000) return (v / 10000).toFixed(1) + "万";
              if (v >= 1000) return (v / 1000).toFixed(1) + "k";
              return v;
            }},
          },
        },
      },
    });
  };

  useEffect(() => { updateChart(); return () => chartInstRef.current?.destroy(); }, []);

  const toggleModel = (i: number) => {
    setModels((prev) => prev.map((m, idx) => idx === i ? { ...m, visible: !m.visible } : m));
    setTimeout(updateChart, 0);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current || !trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const p = Math.max(0, Math.min(((e.clientX - rect.left) / rect.width) * 100, 100));
      if (dragRef.current === "left") setSl(Math.max(0, Math.min(p, sr - 1)));
      else if (dragRef.current === "right") setSr(Math.min(100, Math.max(p, sl + 1)));
      else if (dragRef.current === "fill") {
        const w = sr - sl;
        setSl(Math.max(0, Math.min(p - w / 2, 100 - w)));
        setSr(Math.max(0, Math.min(p + w / 2, 100)));
      }
    };
    const onUp = () => { dragRef.current = null; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
  }, [sl, sr]);

  const sh = Math.round((sl / 100) * 23);
  const eh = Math.round((sr / 100) * 23);

  return (
    <div style={{ padding: "var(--main-padding)" }}>
      {/* Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        {[
          { label: "账户余额", value: "¥12,345.67", action: "立即充值 →", href: "/recharge" },
          { label: "本月消费", value: "¥2,345.00", action: "查看明细 →", href: "/statistics" },
          { label: "今日调用", value: "12,345", href: "/statistics" },
          { label: "活跃 API Key", value: "3 / 5", action: "管理 →", href: "/apikey" },
        ].map((c, i) => (
          <div
            key={i}
            onClick={() => router.push(c.href)}
            style={{ background: "var(--color-panel)", borderRadius: 8, padding: "16px 20px", cursor: "pointer",
              boxShadow: "var(--shadow-card)", transition: "background var(--transition-normal)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--color-primary-lighter)")}
            onMouseLeave={e => (e.currentTarget.style.background = "var(--color-panel)")}
          >
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: "var(--color-text)" }}>{c.value}</div>
            {c.action && <div style={{ fontSize: 11, color: "#6a8aff", marginTop: 6 }}>{c.action}</div>}
          </div>
        ))}
      </div>

      {/* Trend Panel */}
      <div style={{ background: "var(--color-panel)", borderRadius: 8, marginBottom: 16, overflow: "hidden", boxShadow: "var(--shadow-panel)" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-divider)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            📈 模型 Token 消耗曲线 <HelpIcon text="查看各模型 Token 消耗趋势" />
          </h3>
          <div style={{ display: "flex", background: "var(--color-disabled-bg)", borderRadius: 6, padding: 2, gap: 2 }}>
            <button style={{ padding: "4px 12px", fontSize: 12, border: "none", background: "#4f6ef7", borderRadius: 4, color: "#fff", cursor: "pointer" }}>今天</button>
            <button style={{ padding: "4px 12px", fontSize: 12, border: "none", background: "transparent", borderRadius: 4, color: "var(--color-text-secondary)", cursor: "pointer" }}>昨天</button>
            <button style={{ padding: "4px 12px", fontSize: 12, border: "none", background: "transparent", borderRadius: 4, color: "var(--color-text-secondary)", cursor: "pointer" }}>本周</button>
            <button style={{ padding: "4px 12px", fontSize: 12, border: "none", background: "transparent", borderRadius: 4, color: "var(--color-text-secondary)", cursor: "pointer" }}>上月</button>
          </div>
        </div>
        <div style={{ padding: "16px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
            {[
              { label: "今日调用次数", value: "12,847", sub: "成功率 96.7%" },
              { label: "Token 消耗", value: "385.2万", sub: "↑ 96.3万 ↓ 288.9万" },
              { label: "消费金额", value: "¥128.47", sub: "环比 +12.3%" },
              { label: "当前余额", value: "¥1,234.56", sub: "预计可用 7 天", warn: true },
            ].map((s, i) => (
              <div key={i} style={{ background: "var(--color-primary-lighter)", borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.warn ? "#f59e0b" : "var(--color-text)" }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>{s.sub}</div>
              </div>
            ))}
          </div>
          <div style={{ position: "relative", height: 300, width: "100%" }}><canvas ref={chartRef}></canvas></div>
          {/* Slider */}
          <div style={{ marginTop: 10, paddingTop: 12, borderTop: "1px solid var(--color-divider)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b", marginBottom: 6 }}>
              <span>00:00</span><span style={{ color: "#6a8aff", fontWeight: 600 }}>选中：{String(sh).padStart(2,"0")}:00 — {String(eh).padStart(2,"0")}:59（{eh-sh+1}小时）</span><span>23:59</span>
            </div>
            <div ref={trackRef} style={{ position: "relative", height: 28, background: "var(--color-disabled-bg)", borderRadius: 6, cursor: "grab" }}
              onMouseDown={e => {
                const rect = trackRef.current?.getBoundingClientRect(); if (!rect) return;
                const p = Math.max(0, Math.min(((e.clientX - rect.left) / rect.width) * 100, 100));
                if (Math.abs(p - sl) < 5) dragRef.current = "left";
                else if (Math.abs(p - sr) < 5) dragRef.current = "right";
                else if (p > sl && p < sr) dragRef.current = "fill";
                else { if (p < sl) { setSl(Math.max(0, p)); dragRef.current = "left"; } else { setSr(Math.min(100, p)); dragRef.current = "right"; } }
              }}>
              <div style={{ position: "absolute", top: 0, left: sl + "%", bottom: 0, width: (sr - sl) + "%", background: "linear-gradient(90deg, rgba(106,138,255,0.15), rgba(139,92,246,0.12))", borderRadius: 6, pointerEvents: "none" }} />
              <div style={{ position: "absolute", top: 0, left: sl + "%", bottom: 0, width: 8, background: "#6a8aff", borderRadius: 6, zIndex: 2 }} />
              <div style={{ position: "absolute", top: 0, left: sr + "%", bottom: 0, width: 8, background: "#6a8aff", borderRadius: 6, zIndex: 2 }} />
            </div>
          </div>
          {/* Model Chips */}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--color-divider)", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--color-text-secondary)", marginRight: 8 }}>🔘 模型开关</span>
            {models.map((m, i) => (
              <div key={m.id} onClick={() => toggleModel(i)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px 4px 10px", borderRadius: 999, border: `1.5px ${m.visible ? "solid" : "dashed"} ${m.visible ? "var(--color-border)" : "var(--color-border)"}`, background: m.visible ? "var(--color-panel)" : "var(--color-disabled-bg)", opacity: m.visible ? 1 : 0.35, fontSize: 12, cursor: "pointer", userSelect: "none", transition: "all var(--transition-fast)" }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: m.color, flexShrink: 0 }} />
                <span style={{ color: m.visible ? "var(--color-text)" : "var(--color-text-secondary)" }}>{m.name}</span>
                <span style={{ fontSize: 8, color: "#aaa" }}>↑↓</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Two Column */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ background: "var(--color-panel)", borderRadius: 12, boxShadow: "var(--shadow-panel)", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-divider)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: 14, fontWeight: 600 }}>📊 模型调用分布</h3>
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>近 1 小时</span>
          </div>
          <div style={{ padding: "16px 20px" }}>
            {distributionData.map((d) => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, width: 160, flexShrink: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
                  <span style={{ color: "var(--color-text)" }}>{d.name}</span>
                </div>
                <div style={{ flex: 1, height: 6, background: "var(--color-disabled-bg)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: d.pct + "%", background: d.color, borderRadius: 3 }} />
                </div>
                <div style={{ width: 200, textAlign: "right", color: "var(--color-text-secondary)", flexShrink: 0 }}>{d.calls} 次 · {d.tokens} Token</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: "var(--color-panel)", borderRadius: 12, boxShadow: "var(--shadow-panel)", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-divider)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: 14, fontWeight: 600 }}>🕐 最近消费</h3>
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)", cursor: "pointer" }} onClick={() => router.push("/statistics")}>查看全部 →</span>
          </div>
          <div style={{ padding: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr>{["时间","模型","Token","费用","状态"].map(h => <th key={h} style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid var(--color-divider)", color: "var(--color-text-secondary)", fontWeight: 400 }}>{h}</th>)}</tr></thead>
              <tbody>
                {recentData.map((r, i) => (
                  <tr key={i} style={{ cursor: "pointer" }} onClick={() => router.push("/statistics")}>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--color-divider-light)" }}>{r.time}</td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--color-divider-light)" }}>{r.model}</td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--color-divider-light)" }}>{r.tokens}</td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--color-divider-light)" }}>{r.cost}</td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--color-divider-light)", color: r.ok ? "#22c55e" : "var(--color-danger-text)" }}>{r.ok ? "✓ 成功" : "✗ 失败(401)"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Quick Entry */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {[{ icon: "💰", label: "立即充值", href: "/recharge" },{ icon: "🔑", label: "创建 API Key", href: "/apikey" },{ icon: "📈", label: "消费明细", href: "/statistics" },{ icon: "🎫", label: "提交工单", href: "/ticket" }].map((q, i) => (
          <div key={i} onClick={() => router.push(q.href)} style={{ background: "var(--color-panel)", borderRadius: 8, padding: 12, textAlign: "center", cursor: "pointer", fontSize: 13, color: "var(--color-text-secondary)", boxShadow: "var(--shadow-card)", transition: "all var(--transition-fast)" }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--color-primary-lighter)"; e.currentTarget.style.color = "var(--color-primary)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--color-panel)"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{q.icon}</div>{q.label}
          </div>
        ))}
      </div>
    </div>
  );
}
