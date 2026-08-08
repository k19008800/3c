"use client";

import React, { useState, useRef, useEffect } from "react";
import { HelpIcon, StatusBadge } from "@3cloud/shared-ui";
import { Chart } from "chart.js/auto";

const TIME_RANGES = ["今日","昨日","本周","本月","自定义"];
const DIMS = [{ k: "tokens", l: "Token量" },{ k: "cost", l: "费用金额" },{ k: "calls", l: "调用次数" }];
const GRANS = [{ k: "hour", l: "按小时" },{ k: "day", l: "按日" },{ k: "week", l: "按周" }];
const MODEL_COLORS: Record<string, string> = { "ds-v4": "#6a8aff", glm5: "#ff8a65", qwen35: "#66bb6a", "kimi-k2": "#ba68c8", gpt54: "#ffd54f" };
const MODEL_NAMES: Record<string, string> = { "ds-v4": "DeepSeek-V4", glm5: "GLM-5-Pro", qwen35: "Qwen3.5", "kimi-k2": "Kimi-K2", gpt54: "GPT-5.4" };
const modelIds = Object.keys(MODEL_NAMES);

function genDetailRows(count = 245) {
  const models = ["ds-v4","glm5","qwen35","kimi-k2","gpt54"];
  const keys = ["sk-a•••d3x","sk-b•••f7w","sk-c•••m2p"];
  return Array.from({ length: count }, (_, i) => {
    const model = models[i % 5];
    return {
      time: `2026-08-05 ${String(14 - Math.floor(i / 9)).padStart(2, "0")}:${String((i * 3) % 60).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`,
      supplier: MODEL_NAMES[model], model: MODEL_NAMES[model], key: keys[i % 3],
      tokens: Math.round(1000 + Math.random() * 9000), cost: (Math.random() * 9.9 + 0.1).toFixed(4),
      status: i % 5 === 0 ? "fail" : "success", code: ["401","429","500"][i % 3],
    };
  }).sort((a, b) => b.time.localeCompare(a.time));
}

const panel = { background: "var(--color-panel)", borderRadius: 12, boxShadow: "var(--shadow-panel)", overflow: "hidden" };

export default function StatisticsPage() {
  const trRef = useRef<HTMLCanvasElement>(null);
  const trInst = useRef<Chart | null>(null);
  const donutRef = useRef<HTMLCanvasElement>(null);

  const [ALL, setALL] = useState<ReturnType<typeof genDetailRows>>([]);
  useEffect(() => { setALL(genDetailRows()); }, []);

  const [time, setTime] = useState("今日");
  const [dim, setDim] = useState("tokens");
  const [gran, setGran] = useState("hour");
  const [activeModels, setActiveModels] = useState([...modelIds]);
  const [fSupplier, setFSupplier] = useState("");
  const [fModel, setFModel] = useState("");
  const [fKey, setFKey] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const renderTrend = () => {
    if (!trRef.current) return;
    const ctx = trRef.current.getContext("2d");
    if (!ctx) return;
    if (trInst.current) trInst.current.destroy();

    const labels = gran === "hour" ? Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`) :
      gran === "day" ? ["08-01","08-02","08-03","08-04","08-05","08-06","08-07"] : ["W29","W30","W31","W32"];

    const ds = activeModels.map(id => ({
      label: MODEL_NAMES[id],
      data: labels.map(() => {
        const v = Math.round(Math.random() * (dim === "calls" ? 2000 : dim === "cost" ? 80 : 50) + 10);
        return dim === "cost" ? +v.toFixed(1) : v;
      }),
      borderColor: MODEL_COLORS[id], backgroundColor: MODEL_COLORS[id] + "20",
      fill: true, tension: 0.35, pointRadius: 3, borderWidth: 2,
    }));

    trInst.current = new Chart(ctx, {
      type: "line", data: { labels, datasets: ds },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: "var(--color-divider)" } },
          y: { grid: { color: "var(--color-divider)" }, beginAtZero: true },
        },
      },
    });
  };

  useEffect(() => {
    renderTrend();
    if (donutRef.current) {
      new Chart(donutRef.current, {
        type: "doughnut",
        data: { labels: ["401","429","500","其他"], datasets: [{ data: [58,27,15,5], backgroundColor: ["#66bb6a","#ffa726","#ef5350","#888"] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: "65%" },
      });
    }
    return () => { trInst.current?.destroy(); };
  }, []);

  let filtered = ALL;
  if (fSupplier) filtered = filtered.filter(r => r.supplier === fSupplier);
  if (fModel) filtered = filtered.filter(r => r.model === fModel);
  if (fKey) filtered = filtered.filter(r => r.key === fKey);
  if (fStatus) filtered = filtered.filter(r => r.status === fStatus);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageData = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const th: React.CSSProperties = { textAlign: "left", padding: "10px 12px", background: "var(--color-table-header-bg)", fontSize: 13, color: "var(--color-text-secondary)", fontWeight: 500, borderBottom: "1px solid var(--color-divider)", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid var(--color-divider-light)", fontSize: 13, color: "var(--color-text)" };

  return (
    <div style={{ padding: "var(--main-padding)" }}>
      {/* Time Filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {TIME_RANGES.map(t => (
          <button key={t} onClick={() => setTime(t)}
            style={{ padding: "6px 16px", borderRadius: 6, border: "1px solid var(--color-border)", background: time === t ? "var(--color-primary)" : "var(--color-panel)", color: time === t ? "#fff" : "var(--color-text-secondary)", fontSize: 13, cursor: "pointer" }}>
            {t}
          </button>
        ))}
      </div>

      {/* Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        {[
          { l: "今日调用次数", v: "12,345", s: "↑ 8.3% 较昨日", up: true },
          { l: "本月消费", v: "¥2,345.67", s: "↓ 2.1% 较上月" },
          { l: "活跃 Key", v: "3 / 5", s: "87.5% 调用成功率" },
          { l: "总 Token", v: "5.6M", s: "输入 2.1M / 输出 3.5M" },
        ].map((c, i) => (
          <div key={i} style={{ background: "var(--color-panel)", borderRadius: 12, padding: "16px 20px", boxShadow: "var(--shadow-card)" }}>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6 }}>{c.l} <HelpIcon text="" /></div>
            <div style={{ fontSize: 22, fontWeight: 600, color: "var(--color-text)" }}>{c.v}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
              <span style={{ color: c.up ? "#4caf50" : "var(--color-danger-text)" }}>{c.s}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Trend Chart */}
      <div style={panel}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-divider)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600 }}>消费趋势 <HelpIcon text="切换维度查看趋势变化" /></h3>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ display: "flex", gap: 4, background: "var(--color-disabled-bg)", borderRadius: 6, padding: 2 }}>
              {GRANS.map(g => (
                <button key={g.k} onClick={() => { setGran(g.k as any); setTimeout(renderTrend, 0); }}
                  style={{ padding: "4px 12px", borderRadius: 4, border: "none", background: gran === g.k ? "var(--color-primary)" : "transparent", color: gran === g.k ? "#fff" : "var(--color-text-secondary)", fontSize: 12, cursor: "pointer" }}>{g.l}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 4, background: "var(--color-disabled-bg)", borderRadius: 6, padding: 2 }}>
              {DIMS.map(d => (
                <button key={d.k} onClick={() => { setDim(d.k); setTimeout(renderTrend, 0); }}
                  style={{ padding: "4px 12px", borderRadius: 4, border: "none", background: dim === d.k ? "var(--color-primary)" : "transparent", color: dim === d.k ? "#fff" : "var(--color-text-secondary)", fontSize: 12, cursor: "pointer" }}>{d.l}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: "16px 20px" }}>
          <div style={{ height: 300 }}><canvas ref={trRef} /></div>
          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-secondary)", marginRight: 8 }}>模型分布</span>
            {modelIds.map(id => (
              <div key={id} onClick={() => { setActiveModels(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); setTimeout(renderTrend, 0); }}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 12, background: activeModels.includes(id) ? "var(--color-primary-light)" : "var(--color-disabled-bg)", border: `1px solid ${activeModels.includes(id) ? "var(--color-primary)" : "var(--color-border)"}`, fontSize: 12, cursor: "pointer", color: activeModels.includes(id) ? "var(--color-text)" : "var(--color-text-secondary)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: MODEL_COLORS[id] }} />{MODEL_NAMES[id]}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Detail Table */}
      <div style={{ ...panel, marginTop: 16 }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-divider)" }}><h3 style={{ fontSize: 14, fontWeight: 600 }}>调用明细</h3></div>
        <div style={{ padding: "16px 20px" }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>查询条件</span>
            {[{ k: fSupplier, sk: setFSupplier, opts: ["", ...new Set(ALL.map(r => r.supplier))] },{ k: fModel, sk: setFModel, opts: ["", ...Object.values(MODEL_NAMES)] },{ k: fKey, sk: setFKey, opts: ["", "sk-a•••d3x", "sk-b•••f7w", "sk-c•••m2p"] },{ k: fStatus, sk: setFStatus, opts: ["", "success", "fail"] }].map((f, i) => (
              <select key={i} value={f.k} onChange={e => { f.sk(e.target.value); setPage(1); }}
                style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-panel)", fontSize: 13 }}>
                <option value="">{i === 0 ? "全部厂商" : i === 1 ? "全部模型" : i === 2 ? "全部 Key" : "全部状态"}</option>
                {f.opts.filter(Boolean).map(o => <option key={o as string} value={o as string}>{typeof o === "string" && o.includes("success") ? "成功" : o.includes("fail") ? "失败" : o}</option>)}
              </select>
            ))}
            <button onClick={() => { setFSupplier(""); setFModel(""); setFKey(""); setFStatus(""); setPage(1); }}
              style={{ fontSize: 12, padding: "4px 12px", borderRadius: 4, border: "1px solid var(--color-border)", background: "var(--color-panel)", color: "var(--color-text-secondary)", cursor: "pointer" }}>重置</button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["时间","厂商","模型","Key","Token数量","费用","状态"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {pageData.map((r, i) => (
                  <tr key={i}><td style={td}>{r.time}</td><td style={td}>{r.supplier}</td><td style={td}>{r.model}</td><td style={td}>{r.key}</td><td style={td}>{String(Math.round(r.tokens))}</td><td style={td}>¥{r.cost}</td><td style={td}><StatusBadge status={r.status === "success" ? "success" : "danger"}>{r.status === "success" ? "成功" : r.code}</StatusBadge></td></tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>每页</span>
              <select value={pageSize} onChange={e => { setPageSize(+e.target.value); setPage(1); }}
                style={{ height: 32, padding: "0 8px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-panel)", fontSize: 13 }}>
                {[20, 50, 100].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>条</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} style={{ height: 32, minWidth: 32, borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-panel)", color: "var(--color-text)", cursor: safePage > 1 ? "pointer" : "default", opacity: safePage > 1 ? 1 : 0.4 }}>‹</button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const p = safePage <= 3 ? i + 1 : safePage >= totalPages - 2 ? totalPages - 4 + i : safePage - 2 + i;
                return p >= 1 && p <= totalPages ? <button key={p} onClick={() => setPage(p)} style={{ height: 32, minWidth: 32, borderRadius: 6, border: p === safePage ? "1px solid var(--color-primary)" : "1px solid var(--color-border)", background: p === safePage ? "var(--color-primary)" : "var(--color-panel)", color: p === safePage ? "#fff" : "var(--color-text)", cursor: "pointer" }}>{p}</button> : null;
              })}
              <button disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} style={{ height: 32, minWidth: 32, borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-panel)", color: "var(--color-text)", cursor: safePage < totalPages ? "pointer" : "default", opacity: safePage < totalPages ? 1 : 0.4 }}>›</button>
              <span style={{ color: "var(--color-text-secondary)", fontSize: 13, margin: "0 8px" }}>共 {filtered.length} 条</span>
            </div>
          </div>
        </div>
      </div>

      {/* Ranking */}
      <div style={{ ...panel, marginTop: 16 }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-divider)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600 }}>🏆 模型调用排行</h3><span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>按费用金额降序</span>
        </div>
        <div style={{ padding: "16px 20px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr>{["#","模型","调用次数","Token 量","费用","占比"].map(h => <th key={h} style={{ ...th, textAlign: h === "费用" || h === "Token 量" || h === "占比" ? "right" : "left" }}>{h}</th>)}</tr></thead>
            <tbody>
              {[{ rk: 1, n: "DeepSeek-V4", c: "#6a8aff", calls: 12458, tok: "495.3K", cost: "¥495.2", pct: "43.2%" },{ rk: 2, n: "GLM-5-Pro", c: "#ff8a65", calls: 6890, tok: "210.5K", cost: "¥371.4", pct: "32.4%" },{ rk: 3, n: "Qwen3.5", c: "#66bb6a", calls: 4320, tok: "82.1K", cost: "¥115.3", pct: "10.1%" },{ rk: 4, n: "Kimi-K2", c: "#ba68c8", calls: 2780, tok: "56.7K", cost: "¥95.8", pct: "8.4%" },{ rk: 5, n: "GPT-5.4", c: "#ffd54f", calls: 1540, tok: "31.2K", cost: "¥67.2", pct: "5.9%" }].map(r => (
                <tr key={r.rk}><td style={td}>{r.rk}</td><td style={td}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: r.c, marginRight: 6 }} />{r.n}</td><td style={td}>{String(r.calls)}</td><td style={{ ...td, textAlign: "right" }}>{r.tok}</td><td style={{ ...td, textAlign: "right" }}>{r.cost}</td><td style={{ ...td, textAlign: "right" }}>{r.pct}</td></tr>
              ))}
              <tr style={{ background: "var(--color-table-header-bg)", fontWeight: 600 }}><td colSpan={2} style={td}>合计</td><td style={td}>27,988</td><td style={{ ...td, textAlign: "right" }}>875.8K</td><td style={{ ...td, textAlign: "right" }}>¥1,144.9</td><td style={{ ...td, textAlign: "right" }}>100%</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Fail Stats */}
      <div style={{ ...panel, marginTop: 16 }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-divider)" }}><h3 style={{ fontSize: 14, fontWeight: 600 }}>❌ 失败统计</h3></div>
        <div style={{ padding: "16px 20px", display: "flex", gap: 32, alignItems: "center" }}>
          <div><div style={{ fontSize: 32, fontWeight: 600 }}>99.2%</div><div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>成功调用率</div></div>
          <div style={{ width: 120, height: 120 }}><canvas ref={donutRef} /></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {[{ code: "401", pct: 58, cnt: "58次", c: "#66bb6a" },{ code: "429", pct: 27, cnt: "27次", c: "#ffa726" },{ code: "500", pct: 15, cnt: "15次", c: "#ef5350" },{ code: "其他", pct: 5, cnt: "5次", c: "#888" }].map(e => (
              <div key={e.code} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <span style={{ color: e.c }}>{e.code}</span>
                <div style={{ width: 80, height: 6, borderRadius: 3, background: "#f0f0f0", overflow: "hidden" }}><div style={{ height: "100%", width: e.pct + "%", background: e.c, borderRadius: 3 }} /></div>
                <span style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>{e.cnt}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Export */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        {["CSV","Excel"].map(t => (
          <button key={t} onClick={() => alert(`${t} 导出成功`)}
            style={{ padding: "7px 16px", borderRadius: 6, border: "1px solid var(--color-primary)", background: "var(--color-panel)", color: "var(--color-primary)", fontSize: 13, cursor: "pointer" }}>导出 {t}</button>
        ))}
      </div>
    </div>
  );
}
