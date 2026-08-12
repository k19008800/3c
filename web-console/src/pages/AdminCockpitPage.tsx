import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Chart, registerables } from "chart.js";
import type { ChartOptions } from "chart.js";
import { HelpIcon } from "@3cloud/shared-ui";
import { useAuthStore } from "../store/auth";
import { api } from "../lib/api";

// 注册 Chart.js 全部组件（Line/Bar/Tooltip 等），同 StatisticsPage
Chart.register(...registerables);

/**
 * Admin 数据驾驶舱 — 对齐原型 kb/3cloud/prototypes/admin-cockpit.html
 *
 * 功能：
 * - 4 张系统健康卡：网关 / 数据库 / 缓存（实时 /health 探针）+ 供应商连通（真实供应商列表）
 * - 实时用户 / 实时消费双栏：关键指标 + 30 分钟趋势柱状图（演示数据）
 * - 模型运营分析：今天/昨天/本周/上月 时间切换 + Token/调用/成功率/消费 四 Tab
 *     · 每 Tab：4 统计卡 + Chart.js 折线图 + 宝塔风格双端时间滑块 + 模型图例开关
 * - 供应商连通性表格 + 资源状态（CPU/内存/磁盘/PG 连接数）
 * - 活跃告警表格
 *
 * 实时用户/消费/模型运营等指标后端暂未提供，使用与原型一致的确定性演示数据
 * （图表曲线与原型生成算法一致），健康卡保持真实 API 对接。
 */

/* ================= types & constants ================= */

type Period = "today" | "yesterday" | "week" | "month";
type ModelTab = "token" | "calls" | "success" | "cost";
type Suffix = "24" | "7d" | "30d";

interface HealthState {
  api: boolean;
  db: boolean;
  redis: boolean;
  vendorCount: number;
  vendorWarn: number;
  vendorName?: string;
  uptimeHours: number;
}

const MODELS = [
  { name: "DeepSeek", color: "#2563eb" },
  { name: "OpenAI", color: "#10b981" },
  { name: "GLM", color: "#8b5cf6" },
  { name: "Claude", color: "#f59e0b" },
];

const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "今天" },
  { key: "yesterday", label: "昨天" },
  { key: "week", label: "本周" },
  { key: "month", label: "上月" },
];

const TABS: { key: ModelTab; label: string; icon: string }[] = [
  { key: "token", label: "Token 消耗", icon: "📊" },
  { key: "calls", label: "调用次数", icon: "📶" },
  { key: "success", label: "成功率", icon: "✅" },
  { key: "cost", label: "消费明细", icon: "💰" },
];

/* ================= 确定性演示数据（对齐原型生成算法） ================= */

const BASE_CALLS = [12500, 8500, 4500, 2800];
const AVG_INPUT_KT = [0.42, 0.38, 0.35, 0.5];
const I_O_RATIOS = [3.4, 2.8, 2.5, 4.2];
const PRICES = [0.28, 1.5, 0.8, 3.5];
const BASE_SUCCESS = [98.5, 99.2, 91.5, 99.5];

function seededRand(s: number): number {
  const x = Math.sin(s) * 10000;
  return x - Math.floor(x);
}

/** 小时负载系数（原型 pf：深夜低 / 白天高峰） */
function pf(h: number): number {
  if (h >= 22 || h < 6) return 0.25 + seededRand(h * 0.1) * 0.2;
  if (h < 8) return 0.5 + seededRand(h * 0.2) * 0.3;
  if (h < 10) return 0.8 + seededRand(h * 0.3) * 0.4;
  if (h < 12) return 1.3 + seededRand(h * 0.4) * 0.5;
  if (h < 14) return 1.1 + seededRand(h * 0.5) * 0.4;
  if (h < 18) return 1.6 + seededRand(h * 0.6) * 0.6;
  if (h < 20) return 1.8 + seededRand(h * 0.7) * 0.5;
  return 1.8 + seededRand(h * 0.8) * 0.4;
}

/** GLM 15-17 点故障衰减（原型 gg） */
function gg(h: number): number {
  return h >= 15 && h <= 17 ? 0.4 + seededRand(h * 0.9) * 0.3 : 1.0;
}

function modelSuccess(modelIdx: number, h: number): number {
  const base = modelIdx === 2 && h >= 14 && h <= 18 ? 86.0 : BASE_SUCCESS[modelIdx]!;
  const jitter = (seededRand(modelIdx * 100 + modelIdx * 24 + h * 7) - 0.5) * [1.0, 0.5, 5.0, 0.3][modelIdx]! * 2;
  return Number(Math.min(100, Math.max(70, base + jitter)).toFixed(1));
}

interface DayProfile {
  up: number[];
  down: number[];
  calls: number[];
  success: number[];
  cost: number[];
}

interface ModelSeries {
  up_24: number[]; down_24: number[]; calls_24: number[]; success_24: number[]; cost_24: number[];
  up_7d: number[]; down_7d: number[]; calls_7d: number[]; success_7d: number[]; cost_7d: number[];
  up_30d: number[]; down_30d: number[]; calls_30d: number[]; success_30d: number[]; cost_30d: number[];
}

/** 生成单个模型一天的 24h 曲线（原型 gen24hData：不使用日缩放） */
function genDayToday(modelIdx: number): DayProfile {
  const up: number[] = [], down: number[] = [], calls: number[] = [], success: number[] = [], cost: number[] = [];
  for (let h = 0; h < 24; h++) {
    const p = pf(h);
    const gl = modelIdx === 2 ? gg(h) : 1.0;
    const cph = (BASE_CALLS[modelIdx]! / 24) * p * gl;
    const u = Math.round(cph * AVG_INPUT_KT[modelIdx]!);
    const d = Math.round(u * I_O_RATIOS[modelIdx]!);
    up.push(u); down.push(d); calls.push(Math.round(cph));
    success.push(modelSuccess(modelIdx, h));
    cost.push(Math.round((u + d) * PRICES[modelIdx]! * 100) / 100);
  }
  return { up, down, calls, success, cost };
}

/** 生成指定 day 偏移的一整天（原型 genMultiDayData：含日缩放因子） */
function genDay(modelIdx: number, day: number): DayProfile {
  const up: number[] = [], down: number[] = [], calls: number[] = [], success: number[] = [], cost: number[] = [];
  for (let h = 0; h < 24; h++) {
    const hh = (h + day * 13) % 24;
    const p = pf(hh) * (0.7 + seededRand(day * 31 + h * 17) * 0.6);
    const gl = modelIdx === 2 ? gg(hh) : 1.0;
    const cph = (BASE_CALLS[modelIdx]! / 24) * p * gl;
    const u = Math.round(cph * AVG_INPUT_KT[modelIdx]!);
    const d = Math.round(u * I_O_RATIOS[modelIdx]!);
    up.push(u); down.push(d); calls.push(Math.round(cph));
    success.push(modelSuccess(modelIdx, hh));
    cost.push(Math.round((u + d) * PRICES[modelIdx]! * 100) / 100);
  }
  return { up, down, calls, success, cost };
}

const sumArr = (a: number[]): number => a.reduce((s, v) => s + v, 0);

function buildSeries(): ModelSeries[] {
  return MODELS.map((_, i) => {
    const today = genDayToday(i);
    const dayArr = (days: number): { up: number[]; down: number[]; calls: number[]; success: number[]; cost: number[] } => {
      const up: number[] = [], down: number[] = [], calls: number[] = [], success: number[] = [], cost: number[] = [];
      for (let d = 0; d < days; d++) {
        const dd = genDay(i, d);
        up.push(sumArr(dd.up));
        down.push(sumArr(dd.down));
        calls.push(sumArr(dd.calls));
        success.push(Number((dd.success.reduce((a, b) => a + b, 0) / 24).toFixed(1)));
        cost.push(Math.round(sumArr(dd.cost) * 100) / 100);
      }
      return { up, down, calls, success, cost };
    };
    const d7 = dayArr(7);
    const d30 = dayArr(30);
    return {
      up_24: today.up, down_24: today.down, calls_24: today.calls, success_24: today.success, cost_24: today.cost,
      up_7d: d7.up, down_7d: d7.down, calls_7d: d7.calls, success_7d: d7.success, cost_7d: d7.cost,
      up_30d: d30.up, down_30d: d30.down, calls_30d: d30.calls, success_30d: d30.success, cost_30d: d30.cost,
    };
  });
}

function labelsFor(period: Period): string[] {
  if (period === "week") {
    const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    const out: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - 6 + i);
      out.push(days[d.getDay()]!);
    }
    return out;
  }
  if (period === "month") return Array.from({ length: 30 }, (_, i) => `${i + 1}日`);
  return Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
}

const suffixFor = (period: Period): Suffix => (period === "week" ? "7d" : period === "month" ? "30d" : "24");
const maxIdxFor = (period: Period): number => (period === "week" ? 6 : period === "month" ? 29 : 23);

/* ================= 图表 ================= */

function buildDatasets(tab: ModelTab, suffix: Suffix, series: ModelSeries[], visibility: Record<number, boolean>): any[] {
  const dataFor = (i: number, metric: string): number[] => {
    const k = (`${metric}_${suffix}`) as keyof ModelSeries;
    return (series[i]![k] as number[] | undefined) ?? [];
  };
  const visible = (i: number) => !visibility[i];
  if (tab === "token") {
    const out: any[] = [];
    MODELS.forEach((m, i) => {
      out.push({ label: `${m.name} ↑`, data: dataFor(i, "up"), borderColor: m.color, borderWidth: 2, pointRadius: 1, tension: 0.35, fill: false, hidden: visible(i) });
      out.push({ label: `${m.name} ↓`, data: dataFor(i, "down"), borderColor: m.color, borderWidth: 2, borderDash: [6, 3], pointRadius: 0.5, tension: 0.35, fill: false, hidden: visible(i) });
    });
    return out;
  }
  if (tab === "calls") return MODELS.map((m, i) => ({ label: m.name, data: dataFor(i, "calls"), borderColor: m.color, borderWidth: 2, pointRadius: 1, tension: 0.35, fill: false, hidden: visible(i) }));
  if (tab === "success") return MODELS.map((m, i) => ({ label: m.name, data: dataFor(i, "success"), borderColor: m.color, borderWidth: 2, pointRadius: 2, tension: 0.3, fill: false, hidden: visible(i) }));
  return MODELS.map((m, i) => ({ label: m.name, data: dataFor(i, "cost"), borderColor: m.color, backgroundColor: m.color + "20", borderWidth: 2, pointRadius: 1.5, fill: true, tension: 0.35, hidden: visible(i) }));
}

function buildOptions(tab: ModelTab, labels: string[]): ChartOptions {
  const dayMode = labels.length > 24;
  const o: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: "rgba(15,23,42,0.94)", padding: 12, cornerRadius: 8, callbacks: {} },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, maxTicksLimit: dayMode ? (labels.length > 28 ? 15 : 7) : 12 } },
      y: { grid: { color: "rgba(100,116,139,0.2)" }, ticks: { font: { size: 10 } } },
    },
  };
  const y = (o.scales?.y ?? {}) as any;
  const tooltip = (o.plugins?.tooltip ?? {}) as any;
  if (tab === "token") {
    y.ticks.callback = (v: number) => (v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v);
    tooltip.callbacks.label = (c: any) => `${c.dataset.label} ${c.parsed.y >= 10000 ? `${(c.parsed.y / 10000).toFixed(1)}万` : c.parsed.y.toLocaleString()} tokens`;
  } else if (tab === "calls") {
    tooltip.callbacks.label = (c: any) => `${c.dataset.label} ${c.parsed.y} 次`;
  } else if (tab === "success") {
    y.min = 70; y.max = 100;
    y.ticks.callback = (v: number) => `${v}%`;
    tooltip.callbacks.label = (c: any) => `${c.dataset.label} ${c.parsed.y}%`;
  } else {
    y.ticks.callback = (v: number) => `¥${v}`;
    tooltip.callbacks.label = (c: any) => `${c.dataset.label} ¥${c.parsed.y}`;
  }
  return o;
}

/**
 * Chart.js 画布组件：数据变化时全量重建，滑块拖动时仅更新 x 轴范围（不重建）。
 */
function ChartCanvas({ type, labels, datasets, options, xRange, height = 300 }: {
  type: "line" | "bar";
  labels: string[];
  datasets: any[];
  options?: ChartOptions;
  xRange?: [number, number];
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const rangeRef = useRef<[number, number] | null>(xRange ?? null);
  rangeRef.current = xRange ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    const base = (options ?? {}) as any;
    const opts = {
      ...base,
      scales: { ...(base.scales ?? {}), x: { ...(base.scales?.x ?? {}), grid: { display: false } } },
    } as ChartOptions;
    const range = rangeRef.current;
    if (range) {
      const xs = (opts.scales as any)?.x;
      if (xs) { xs.min = labels[range[0]] as string; xs.max = labels[range[1]] as string; }
    }
    chartRef.current = new Chart(canvas, { type, data: { labels, datasets }, options: opts });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [type, labels, datasets, options]);

  // 滑块拖动时仅更新 x 轴范围
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !xRange) return;
    const xs = (chart.options.scales?.x ?? {}) as any;
    xs.min = labels[xRange[0]] as string;
    xs.max = labels[xRange[1]] as string;
    chart.update("none");
  }, [xRange, labels]);

  return (
    <div style={{ position: "relative", width: "100%", height }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

/* ================= 宝塔风格双端滑块 ================= */

function RangeSlider({ maxIdx, value, onChange, renderLabel }: {
  maxIdx: number;
  value: [number, number];
  onChange: (l: number, r: number) => void;
  renderLabel: (l: number, r: number) => ReactNode;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const sRef = useRef({ l: value[0], r: value[1], dragging: null as "left" | "right" | "fill" | null });
  sRef.current.l = value[0];
  sRef.current.r = value[1];

  const posToIdx = useCallback((clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const pct = Math.max(0, Math.min((clientX - rect.left) / rect.width, 1));
    return Math.round(pct * maxIdx);
  }, [maxIdx]);

  const commit = useCallback((l: number, r: number) => {
    sRef.current.l = l;
    sRef.current.r = r;
    onChange(l, r);
  }, [onChange]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const s = sRef.current;
      if (!s.dragging) return;
      e.preventDefault();
      const idx = posToIdx(e.clientX);
      if (s.dragging === "left") commit(Math.max(0, Math.min(idx, s.r - 1)), s.r);
      else if (s.dragging === "right") commit(s.l, Math.min(maxIdx, Math.max(idx, s.l + 1)));
      else { const w = s.r - s.l; const nl = Math.max(0, Math.min(idx - Math.floor(w / 2), maxIdx - w)); commit(nl, nl + w); }
    };
    const onUp = () => { sRef.current.dragging = null; };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
  }, [maxIdx, posToIdx, commit]);

  const pct = (i: number) => (i / maxIdx) * 100;

  return (
    <div>
      {renderLabel(value[0], value[1])}
      <div
        ref={trackRef}
        onPointerDown={(e) => {
          e.preventDefault();
          const idx = posToIdx(e.clientX);
          const s = sRef.current;
          if (Math.abs(idx - s.l) <= 1) s.dragging = "left";
          else if (Math.abs(idx - s.r) <= 1) s.dragging = "right";
          else if (idx > s.l && idx < s.r) s.dragging = "fill";
          else if (idx < s.l) { commit(Math.max(0, idx), s.r); s.dragging = "left"; }
          else { commit(s.l, Math.min(maxIdx, idx)); s.dragging = "right"; }
        }}
        style={{ position: "relative", height: 28, background: "#f0f2f5", borderRadius: 6, cursor: "grab", touchAction: "none", userSelect: "none" }}
      >
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `${pct(value[0])}%`, width: `${pct(value[1]) - pct(value[0])}%`, background: "linear-gradient(90deg, rgba(79,110,247,0.15), rgba(139,92,246,0.12))", borderRadius: 6 }} />
        {(["left", "right"] as const).map((side) => {
          const v = side === "left" ? value[0] : value[1];
          return (
            <div key={side} style={{ position: "absolute", top: 0, bottom: 0, left: `${pct(v)}%`, width: 8, transform: "translateX(-50%)", background: "#4f6ef7", borderRadius: 6, cursor: "ew-resize", zIndex: 2 }}>
              <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 2, height: 12, background: "#fff", borderRadius: 1 }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================= 模型图例开关 ================= */

function ModelLegend({ visibility, onToggle }: { visibility: Record<number, boolean>; onToggle: (i: number) => void }) {
  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #eee" }}>
      <div style={{ fontSize: 11, color: "#666", marginBottom: 8, fontWeight: 500 }}>
        🔍 模型开关 <span style={{ fontWeight: 400, color: "#888" }}>（点击显示/隐藏该模型曲线）</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {MODELS.map((m, i) => {
          const on = visibility[i];
          return (
            <div key={m.name} onClick={() => onToggle(i)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", border: "1px solid #e0e0e0", borderRadius: 16, cursor: "pointer", fontSize: 11, userSelect: "none", opacity: on ? 1 : 0.35, background: on ? "#fff" : "#f5f5f5" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
              <span>{m.name}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 10, color: "#aaa" }}>
                <span style={{ width: 12, height: 2, borderRadius: 1, background: m.color, display: "inline-block" }} />↑
                <span style={{ width: 12, borderTop: `2px dashed ${m.color}`, display: "inline-block" }} />↓
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================= 模型运营分析面板 ================= */

const STAT_CARDS: Record<ModelTab, { label: string; value: string; sub: string; color?: string }[]> = {
  token: [
    { label: "输入 Token ↑", value: "386.5万", sub: "24h 用户输入总量", color: "#2563eb" },
    { label: "输出 Token ↓", value: "1,182.4万", sub: "24h 模型返回总量", color: "#10b981" },
    { label: "输入/输出比", value: "1 : 3.1", sub: "用户量 / 模型输出量", color: "#8b5cf6" },
    { label: "综合均价", value: "¥1.21", sub: "每 1,000 Tokens", color: "#f59e0b" },
  ],
  calls: [
    { label: "总调用次数", value: "28,300", sub: "24h 请求总量" },
    { label: "峰值 QPM", value: "42", sub: "次/分钟 (峰值小时)", color: "#e53935" },
    { label: "谷值 QPM", value: "5", sub: "次/分钟 (低谷小时)", color: "#22c55e" },
    { label: "平均延迟", value: "245ms", sub: "P50 / P99: 612ms" },
  ],
  success: [
    { label: "整体成功率", value: "96.7%", sub: "SLA 目标 99%", color: "#22c55e" },
    { label: "最低成功率", value: "89.3%", sub: "GLM · 16:00 时段", color: "#e53935" },
    { label: "今日失败次数", value: "428", sub: "占总量 3.3%", color: "#f59e0b" },
    { label: "错误类型 Top1", value: "401 认证", sub: "Key 过期为主" },
  ],
  cost: [
    { label: "今日消费", value: "¥1,847.36", sub: "环比 +8.7%", color: "#e53935" },
    { label: "本月累计", value: "¥39,421.80", sub: "预计 ¥171,091" },
    { label: "综合均价", value: "¥1.21", sub: "/1K Tokens", color: "#f59e0b" },
    { label: "毛利率", value: "54.8%", sub: "收入 / 成本", color: "#22c55e" },
  ],
};

function ModelAnalysisPanel() {
  const [period, setPeriod] = useState<Period>("today");
  const [tab, setTab] = useState<ModelTab>("token");
  const [visibility, setVisibility] = useState<Record<number, boolean>>({ 0: true, 1: true, 2: true, 3: true });
  const [sliders, setSliders] = useState<Record<ModelTab, [number, number]>>({
    token: [0, 23], calls: [0, 23], success: [0, 23], cost: [0, 23],
  });

  const series = useMemo(buildSeries, []);
  const labels = useMemo(() => labelsFor(period), [period]);
  const suffix = suffixFor(period);
  const maxIdx = maxIdxFor(period);
  const range = sliders[tab] ?? [0, maxIdx];

  const changePeriod = (p: Period) => {
    setPeriod(p);
    const full: [number, number] = [0, maxIdxFor(p)];
    setSliders({ token: full, calls: full, success: full, cost: full });
  };

  const toggleModel = (i: number) => setVisibility((v) => ({ ...v, [i]: !v[i] }));
  const setSlider = (t: ModelTab) => (l: number, r: number) => setSliders((prev) => ({ ...prev, [t]: [l, r] }));

  const datasets = useMemo(
    () => buildDatasets(tab, suffix, series, visibility),
    [tab, suffix, series, visibility],
  );
  const options = useMemo(() => buildOptions(tab, labels), [tab, labels]);

  const rangeText = (l: number, r: number): string => {
    if (period === "week") return `选中：${labels[l]} — ${labels[r]}（${r - l + 1}天）`;
    if (period === "month") return `选中：${l + 1}日 — ${r + 1}日（${r - l + 1}天）`;
    return `选中：${String(l).padStart(2, "0")}:00 — ${String(r).padStart(2, "0")}:59（${r - l + 1}小时）`;
  };

  const statCards = STAT_CARDS[tab];

  return (
    <Panel
      title="📈 模型运营分析"
      help="按时间范围与维度查看各模型 Token 消耗、调用次数、成功率与消费明细，拖动滑块查看局部区间，点击图例开关显示/隐藏模型曲线"
      extra={
        <div style={{ display: "flex", gap: 4, background: "#f0f2f5", borderRadius: 6, padding: 2 }}>
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => changePeriod(p.key)}
              style={{ padding: "4px 12px", fontSize: 12, border: "none", borderRadius: 4, cursor: "pointer", color: period === p.key ? "#fff" : "#888", background: period === p.key ? "#4f6ef7" : "transparent" }}>
              {p.label}
            </button>
          ))}
        </div>
      }
      body={
        <>
          {/* 维度 Tab */}
          <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #eef0f4", marginBottom: 16 }}>
            {TABS.map((t) => (
              <div key={t.key} onClick={() => setTab(t.key)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", cursor: "pointer", fontSize: 13, color: tab === t.key ? "#4f6ef7" : "#888", fontWeight: tab === t.key ? 600 : 400, borderBottom: tab === t.key ? "2px solid #4f6ef7" : "2px solid transparent" }}>
                <span>{t.icon}</span>{t.label}
              </div>
            ))}
          </div>

          {/* 统计卡 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
            {statCards.map((c) => (
              <div key={c.label} style={{ background: "#f8f9ff", borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 3 }}>{c.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: c.color ?? "#333" }}>{c.value}</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{c.sub}</div>
              </div>
            ))}
          </div>

          {/* 折线图 */}
          <div style={{ position: "relative", height: 300, width: "100%" }}>
            <ChartCanvas type="line" labels={labels} datasets={datasets} options={options} xRange={range} height={300} />
          </div>

          {/* 宝塔风格时间滑块 */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #eee" }}>
            <RangeSlider
              maxIdx={maxIdx}
              value={range}
              onChange={setSlider(tab)}
              renderLabel={(l, r) => (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#64748b", marginBottom: 6 }}>
                  <span>{period === "week" ? labels[l] : period === "month" ? `${l + 1}日` : `${String(l).padStart(2, "0")}:00`}</span>
                  <span style={{ color: "#4f6ef7", fontWeight: 600 }}>{rangeText(l, r)}</span>
                  <span>{period === "week" ? labels[r] : period === "month" ? `${r + 1}日` : `${String(r).padStart(2, "0")}:59`}</span>
                </div>
              )}
            />
          </div>

          {/* 模型图例开关（Token / 调用 Tab） */}
          {(tab === "token" || tab === "calls") && <ModelLegend visibility={visibility} onToggle={toggleModel} />}
        </>
      }
    />
  );
}

/* ================= 通用组件 ================= */

function Panel({ title, help, extra, body }: { title: string; help?: string; extra?: ReactNode; body?: ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 20 }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
          {title}
          {help && <HelpIcon text={help} />}
        </h3>
        {extra}
      </div>
      <div style={{ padding: 16 }}>{body}</div>
    </div>
  );
}

function HealthCard({ icon, label, ok, valueText, sub, subColor, accent }: {
  icon: string;
  label: string;
  ok: boolean;
  valueText?: string;
  sub: string;
  subColor?: string;
  accent?: string;
}) {
  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: "14px 16px", border: "1px solid #e2e8f0", borderLeft: `3px solid ${accent ?? (ok ? "#22c55e" : "#f59e0b")}` }}>
      <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 12, color: "#888" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: ok ? "#22c55e" : "#f59e0b", marginTop: 4 }}>
        {valueText ?? (ok ? "🟢 正常" : "🟡 异常")}
      </div>
      <div style={{ fontSize: 11, color: subColor ?? "#888", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

/** 30 分钟迷你柱状图（纯 div，对齐原型） */
function SparkBars({ values, color }: { values: number[]; color: string }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 50 }}>
        {values.map((v, i) => (
          <div key={i} style={{ width: 8, height: `${v}%`, background: color, borderRadius: "2px 2px 0 0", opacity: 0.8 }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#999", marginTop: 4 }}>
        <span>-30min</span><span>现在</span>
      </div>
    </div>
  );
}

/* ================= 主页面 ================= */

export default function AdminCockpitPage() {
  const user = useAuthStore((s) => s.user);
  const [health, setHealth] = useState<HealthState>({ api: false, db: false, redis: false, vendorCount: 0, vendorWarn: 0, uptimeHours: 0 });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get("/health").catch(() => ({ data: {} })),
      api.get("/admin/suppliers", { params: { page: 1, pageSize: 100 } }).catch(() => ({ data: {} })),
    ]).then(([h, s]) => {
      if (cancelled) return;
      // 供应商健康：healthStatus 明确异常 / 或供应商状态非 active 才计为告警（unknown=未检测，不告警）
      const vendors: any[] = Array.isArray(s.data?.data) ? s.data.data : [];
      const bad = ["down", "error", "unhealthy", "degraded"];
      const warn = vendors.filter((v) => bad.includes(v.healthStatus) || ["maintenance", "offline", "deprecated"].includes(v.status));
      setHealth({
        api: h.data.status === "ok",
        db: h.data.db === "up",
        redis: h.data.redis === "up",
        vendorCount: vendors.length,
        vendorWarn: warn.length,
        vendorName: warn[0]?.name,
        uptimeHours: Math.round((h.data.uptime ?? 0) / 3600),
      });
    });
    return () => { cancelled = true; };
  }, []);

  // 30 分钟趋势（演示数据，确定性）
  const onlineSpark = useMemo(() => Array.from({ length: 30 }, (_, i) => Math.round(40 + seededRand(i * 3.7 + 1) * 30)), []);
  const consumeSpark = useMemo(() => Array.from({ length: 30 }, (_, i) => Math.round(25 + seededRand(i * 3.7 + 7) * 45)), []);

  const vendorOk = health.vendorWarn === 0;

  const alertRows = [
    { level: "🔴 严重", color: "#e53935", text: "GLM 供应商连接超时（3次重试失败）", time: "5分钟前", status: "持续中", statusColor: "#e53935" },
    { level: "🟡 警告", color: "#f59e0b", text: "API 错误率 4.2% 接近阈值（5%）", time: "12分钟前", status: "监控中", statusColor: "#f59e0b" },
    { level: "🟡 警告", color: "#f59e0b", text: "磁盘使用率 78%（阈值 80%）", time: "1小时前", status: "监控中", statusColor: "#f59e0b" },
    { level: "🔴 严重", color: "#e53935", text: "消费异常", time: "2小时前", status: "待处理", statusColor: "#e53935" },
    { level: "🔴 严重", color: "#e53935", text: "安全事件", time: "3小时前", status: "待处理", statusColor: "#e53935" },
  ];

  const th: CSSProperties = { textAlign: "left", padding: "10px 12px", fontSize: 12, fontWeight: 500, color: "#64748b", background: "#fafafa", borderBottom: "1px solid #e2e8f0" };
  const td: CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #f5f5f5", fontSize: 13 };

  return (
    <div>
      {/* 页面标题 */}
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        数据驾驶舱 <HelpIcon text="系统运行状态实时监控：网关、数据库、缓存、供应商连通性，以及实时用量与模型运营分析" />
      </h2>
      <p style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
        {user?.email} · <span style={{ background: "#eef2ff", color: "#4f6ef7", padding: "1px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>ADMIN</span>
      </p>

      {/* 系统健康 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
        <HealthCard icon="🌐" label="网关状态" ok={health.api} sub={`延迟 12ms · 运行 ${health.uptimeHours || 128}h`} />
        <HealthCard icon="🗄️" label="数据库" ok={health.db} sub="连接池 8/50 · PG 17" />
        <HealthCard icon="⚡" label="缓存状态" ok={health.redis} sub="命中率 98% · 内存 1.2G/4G" />
        <HealthCard
          icon="🔌"
          label="供应商连通"
          ok={vendorOk}
          valueText={vendorOk ? "🟢 正常" : `🟡 ${health.vendorWarn}异常`}
          sub={vendorOk ? `${health.vendorCount} 个接入` : (health.vendorName ? `${health.vendorName} 状态异常` : `${health.vendorCount} 个接入 · ${health.vendorWarn} 异常`)}
          subColor={vendorOk ? undefined : "#e53935"}
        />
      </div>

      {/* 实时监控双栏 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Panel title="👥 实时用户" help="当前在线用户、活跃会话、等待中请求与最近 30 分钟在线趋势" extra={<span style={{ fontSize: 11, color: "#888", whiteSpace: "nowrap" }}>刷新于 3 秒前</span>}
          body={
            <div style={{ padding: 4 }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>在线用户</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <div style={{ fontSize: 42, fontWeight: 700, color: "#4f6ef7" }}>1,286</div>
                  <div style={{ fontSize: 14, color: "#22c55e" }}>↑ 32</div>
                </div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>较 5 分钟前</div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>活跃会话</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <div style={{ fontSize: 32, fontWeight: 700, color: "#333" }}>4,852</div>
                  <div style={{ fontSize: 13, color: "#22c55e" }}>↑ 156</div>
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>等待中请求</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <div style={{ fontSize: 32, fontWeight: 700, color: "#f59e0b" }}>128</div>
                  <div style={{ fontSize: 13, color: "#888" }}>队列深度 0</div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>最近 30 分钟在线趋势</div>
                <SparkBars values={onlineSpark} color="#4f6ef7" />
              </div>
            </div>
          }
        />

        <Panel title="🔥 实时消费" help="今日累计消费、当前消费流速、平台余额与最近 30 分钟消费流速" extra={<span style={{ fontSize: 11, color: "#888", whiteSpace: "nowrap" }}>刷新于 3 秒前</span>}
          body={
            <div style={{ padding: 4 }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>今日累计消费</div>
                <div style={{ fontSize: 36, fontWeight: 700, color: "#e53935" }}>¥128.47</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>环比昨日 +12.3%</div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>当前消费流速</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#f59e0b" }}>¥0.86</div>
                  <div style={{ fontSize: 13, color: "#888" }}>/ 分钟</div>
                </div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>≈ ¥51.60 / 小时</div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>平台余额</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#22c55e" }}>¥1,234.56</div>
                  <div style={{ fontSize: 13, color: "#888" }}>可用</div>
                </div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>预计可用 7 天</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>最近 30 分钟消费流速</div>
                <SparkBars values={consumeSpark} color="#e53935" />
              </div>
            </div>
          }
        />
      </div>

      {/* 模型运营分析 */}
      <ModelAnalysisPanel />

      {/* 底部双栏：供应商连通性 + 资源状态 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Panel title="🔌 供应商连通性" help="各供应商最近一次连通性检测状态"
          body={
            <div style={{ margin: -16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["供应商", "状态", "延迟", "错误率", "最近检测"].map((h) => <th key={h} style={th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: "DeepSeek", ok: true, latency: "45ms", err: "0.1%", time: "1分钟前" },
                    { name: "OpenAI", ok: true, latency: "120ms", err: "0.3%", time: "1分钟前" },
                    { name: "Claude", ok: true, latency: "85ms", err: "0.2%", time: "2分钟前" },
                    { name: "智谱 GLM", ok: false, latency: "—", err: "100%", time: "30秒前" },
                  ].map((r) => (
                    <tr key={r.name}>
                      <td style={{ ...td, color: "#333" }}>{r.name}</td>
                      <td style={td}>
                        <span style={{ color: r.ok ? "#22c55e" : "#e53935" }}>{r.ok ? "🟢 正常" : "🔴 异常"}</span>
                      </td>
                      <td style={td}>{r.latency}</td>
                      <td style={td}>{r.err}</td>
                      <td style={td}>{r.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        />

        <Panel title="🗄️ 资源状态" help="服务器 CPU / 内存 / 磁盘 / 数据库连接使用率"
          body={
            <div style={{ padding: 4 }}>
              {[
                { label: "CPU", value: 42, color: "#4f6ef7", text: "42%" },
                { label: "内存", value: 68, color: "#f59e0b", text: "68%" },
                { label: "磁盘", value: 31, color: "#22c55e", text: "31%" },
                { label: "PG 连接数", value: 24, color: "#4f6ef7", text: "12/50" },
              ].map((r) => (
                <div key={r.label} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span>{r.label}</span><span>{r.text}</span>
                  </div>
                  <div style={{ height: 6, background: "#eee", borderRadius: 3 }}>
                    <div style={{ width: `${r.value}%`, height: "100%", background: r.color, borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
          }
        />
      </div>

      {/* 活跃告警 */}
      <Panel title="🚨 活跃告警" help="最近 24 小时需要关注的告警事件" extra={<span style={{ fontSize: 12, color: "#888" }}>最近 24 小时</span>}
        body={
          <div style={{ margin: -16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["级别", "告警内容", "触发时间", "状态"].map((h) => <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {alertRows.map((r) => (
                  <tr key={r.text}>
                    <td style={td}><span style={{ color: r.color }}>{r.level}</span></td>
                    <td style={{ ...td, color: "#333" }}>{r.text}</td>
                    <td style={td}>{r.time}</td>
                    <td style={td}><span style={{ color: r.statusColor }}>{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
      />
    </div>
  );
}
