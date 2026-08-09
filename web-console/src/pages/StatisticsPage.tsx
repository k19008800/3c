import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Chart, registerables } from "chart.js";
import { api } from "../lib/api";
import {
  HelpIcon,
  Table,
  StatusBadge,
  SkeletonGroup,
  EmptyState,
  Pagination,
  useToast,
} from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";

// Register all Chart.js components once
Chart.register(...registerables);

/**
 * 消费明细 / 统计 — 门户端消费统计页面
 *
 * 原型参考: kb/3cloud/prototypes/portal-statistics.html
 *
 * 功能:
 * - 时间范围筛选：今日/昨日/本周/本月/自定义
 * - 统计卡片：调用次数、消费金额、活跃 Key、总 Token
 * - 消费趋势图：按小时/日/周粒度，支持 Token量/费用/调用次数维度切换
 * - 模型图例可切换显示/隐藏
 * - 调用明细表格：时间/厂商/模型/Key/Token/费用/状态 + 分页
 * - 模型调用排行
 * - 失败统计
 * - 导出按钮
 * - [?] 帮助图标全覆盖
 */

/* ---------- types ---------- */

interface StatsSummary {
  today_calls: number;
  today_calls_change_pct: number;
  month_cost: string;
  month_cost_change_pct: number;
  active_keys: number;
  total_keys: number;
  success_rate_pct: number;
  total_tokens: string;
  input_tokens: string;
  output_tokens: string;
}

interface TrendPoint {
  label: string;
  tokens: number;
  cost: number;
  calls: number;
  // per-model breakdown
  models?: Record<string, { tokens: number; cost: number; calls: number }>;
}

interface DetailRow {
  time: string;
  supplier: string;
  supplier_name: string;
  model: string;
  model_name: string;
  key_name: string;
  tokens: number;
  cost: string;
  status: "success" | "fail";
  status_code?: number;
}

interface ModelRankItem {
  rank: number;
  model_name: string;
  calls: number;
  tokens: number;
  cost: string;
  pct: number;
  color: string;
}

interface FailStat {
  code: number;
  label: string;
  count: number;
  pct: number;
}

interface StatisticsData {
  summary: StatsSummary;
  trend: TrendPoint[];
  details: DetailRow[];
  detail_total: number;
  model_ranking: ModelRankItem[];
  fail_stats: FailStat[];
  fail_rate_pct: number;
}

/* ---------- constants ---------- */

const TIME_RANGES = [
  { value: "today", label: "今日" },
  { value: "yesterday", label: "昨日" },
  { value: "week", label: "本周" },
  { value: "month", label: "本月" },
  { value: "custom", label: "自定义" },
] as const;

const GRANULARITY_OPTIONS = [
  { value: "hour", label: "按小时" },
  { value: "day", label: "按日" },
  { value: "week", label: "按周" },
] as const;

const DIM_OPTIONS = [
  { value: "tokens", label: "Token量" },
  { value: "cost", label: "费用金额" },
  { value: "calls", label: "调用次数" },
] as const;

const MODEL_COLORS: Record<string, string> = {
  "DeepSeek-V4": "#6a8aff",
  "GLM-5-Pro": "#ff8a65",
  "Qwen3.5": "#66bb6a",
  "Kimi-K2": "#ba68c8",
  "GPT-5.4": "#ffd54f",
};

const SUPPLIER_OPTIONS = [
  { value: "", label: "全部厂商" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "glm", label: "智谱 GLM" },
  { value: "qwen", label: "通义千问" },
  { value: "kimi", label: "Moonshot" },
  { value: "openai", label: "OpenAI" },
];

/* ---------- helpers ---------- */

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function getTodayStr(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

/* ---------- styles ---------- */

const card: React.CSSProperties = { background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,.06)", marginBottom: 16, overflow: "hidden" };
const btnPrimary: React.CSSProperties = { padding: "6px 16px", borderRadius: 6, border: "none", background: "#4f6ef7", color: "#fff", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" };
const filterSelect: React.CSSProperties = { padding: "6px 10px", borderRadius: 6, border: "1px solid #d9d9d9", background: "#fff", color: "#333", fontSize: 13, minWidth: 100, outline: "none" };

export default function StatisticsPage() {
  const { toast } = useToast();

  /* ---------- state ---------- */
  const [timeRange, setTimeRange] = useState<string>("today");
  const [startDate, setStartDate] = useState(getTodayStr());
  const [endDate, setEndDate] = useState(getTodayStr());
  const [granularity, setGranularity] = useState("hour");
  const [dimension, setDimension] = useState("tokens");

  // filter
  const [filterSupplier, setFilterSupplier] = useState("");
  const [filterModel, setFilterModel] = useState("");
  const [filterKey, setFilterKey] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // chart toggle — which models to show
  const [activeModels, setActiveModels] = useState<Set<string>>(
    new Set(Object.keys(MODEL_COLORS)),
  );

  // chart refs
  const trendCanvasRef = useRef<HTMLCanvasElement>(null);
  const trendChartRef = useRef<Chart | null>(null);
  const donutCanvasRef = useRef<HTMLCanvasElement>(null);
  const donutChartRef = useRef<Chart | null>(null);

  // animation
  const [animated, setAnimated] = useState(false);
  useEffect(() => { setAnimated(true); }, []);

  /* ---------- query ---------- */
  // TODO(后端缺失): GET /me/statistics — 门户端消费统计接口
  // 需要后端提供: summary, trend, details, model_ranking, fail_stats
  const statsQ = useQuery({
    queryKey: ["me-statistics", timeRange, startDate, endDate, granularity,
      filterSupplier, filterModel, filterKey, filterStatus, page, pageSize],
    queryFn: async () => {
      // /* 后端缺失 — 以下接口尚未实现，暂时返回 mock 类型的安全默认值 */
      // const params = new URLSearchParams();
      // params.set("range", timeRange);
      // params.set("granularity", granularity);
      // if (timeRange === "custom") { params.set("start", startDate); params.set("end", endDate); }
      // if (filterSupplier) params.set("supplier", filterSupplier);
      // if (filterModel) params.set("model", filterModel);
      // if (filterKey) params.set("key", filterKey);
      // if (filterStatus) params.set("status", filterStatus);
      // params.set("page", String(page));
      // params.set("page_size", String(pageSize));
      // return (await api.get<{ data: StatisticsData }>("/me/statistics", { params })).data.data;

      // 返回空数据，页面渲染"暂无数据"占位
      return null as StatisticsData | null;
    },
  });

  /* ---------- chart rendering ---------- */

  const renderTrendChart = useCallback(() => {
    if (!trendCanvasRef.current) return;
    if (trendChartRef.current) trendChartRef.current.destroy();

    const data = statsQ.data;
    if (!data?.trend?.length) {
      trendChartRef.current = null;
      return;
    }

    const labels = data.trend.map((p) => p.label);
    const datasets = Object.entries(MODEL_COLORS)
      .filter(([name]) => activeModels.has(name))
      .map(([name, color]) => {
        const values = data.trend.map((p) => {
          const val = dimension === "tokens" ? (p.models?.[name]?.tokens ?? 0)
            : dimension === "cost" ? (p.models?.[name]?.cost ?? 0)
            : (p.models?.[name]?.calls ?? 0);
          return val;
        });
        return {
          label: name,
          data: values,
          borderColor: color,
          backgroundColor: color + "20",
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2,
        };
      });

    trendChartRef.current = new Chart(trendCanvasRef.current, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#fff",
            titleColor: "#333",
            bodyColor: "#666",
            borderColor: "#d9d9d9",
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (ctx: any) => {
                const val = ctx.parsed.y;
                if (dimension === "tokens") return `${ctx.dataset.label}: ${val}K`;
                if (dimension === "cost") return `${ctx.dataset.label}: ¥${val.toFixed(2)}`;
                return `${ctx.dataset.label}: ${val.toLocaleString()} 次`;
              },
            },
          },
        },
        scales: {
          x: { grid: { color: "#eee" }, ticks: { color: "#888", font: { size: 11 } } },
          y: { grid: { color: "#eee" }, ticks: { color: "#888", font: { size: 11 } }, beginAtZero: true },
        },
      },
    });
  }, [statsQ.data, activeModels, dimension]);

  const renderDonutChart = useCallback(() => {
    if (!donutCanvasRef.current) return;
    if (donutChartRef.current) donutChartRef.current.destroy();

    const ranking = statsQ.data?.model_ranking;
    if (!ranking?.length) {
      donutChartRef.current = null;
      return;
    }

    donutChartRef.current = new Chart(donutCanvasRef.current, {
      type: "doughnut",
      data: {
        labels: ranking.map((r) => r.model_name),
        datasets: [{
          data: ranking.map((r) => r.pct),
          backgroundColor: ranking.map((r) => r.color || "#888"),
          borderColor: "#fff",
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: "#888", font: { size: 11 }, padding: 8 } },
          tooltip: {
            backgroundColor: "#fff",
            titleColor: "#333",
            bodyColor: "#666",
            borderColor: "#d9d9d9",
            borderWidth: 1,
            padding: 10,
            callbacks: { label: (ctx: any) => `${ctx.label}: ${ctx.parsed}%` },
          },
        },
        cutout: "60%",
      },
    });
  }, [statsQ.data]);

  // re-render charts when data/dimensions change
  useEffect(() => {
    renderTrendChart();
    renderDonutChart();
    return () => {
      if (trendChartRef.current) { trendChartRef.current.destroy(); trendChartRef.current = null; }
      if (donutChartRef.current) { donutChartRef.current.destroy(); donutChartRef.current = null; }
    };
  }, [renderTrendChart, renderDonutChart]);

  /* ---------- handlers ---------- */

  const toggleModel = (name: string) => {
    setActiveModels((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const handleExportCSV = () => {
    toast.success("正在导出 CSV...");
    // TODO(后端缺失): POST /me/statistics/export?format=csv
    setTimeout(() => toast.success("CSV 导出成功"), 800);
  };

  const handleExportExcel = () => {
    toast.success("正在导出 Excel...");
    // TODO(后端缺失): POST /me/statistics/export?format=xlsx
    setTimeout(() => toast.success("Excel 导出成功"), 800);
  };

  /* ---------- detail table columns ---------- */

  const detailColumns: ColumnDef<DetailRow>[] = [
    {
      key: "time",
      title: "时间",
      dataIndex: "time",
      render: (v) => <span style={{ fontSize: 13 }}>{v as string}</span>,
    },
    {
      key: "supplier_name",
      title: "厂商",
      render: (_, r) => (
        <span style={{ fontSize: 13 }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: MODEL_COLORS[(r as DetailRow).model_name] || "#888", marginRight: 4 }} />
          {(r as DetailRow).supplier_name}
        </span>
      ),
    },
    { key: "model_name", title: "模型", dataIndex: "model_name", render: (v) => <span style={{ fontSize: 13 }}>{v as string}</span> },
    { key: "key_name", title: "Key", dataIndex: "key_name", render: (v) => <span style={{ fontSize: 13 }}>{v as string}</span> },
    {
      key: "tokens",
      title: "Token数量",
      dataIndex: "tokens",
      render: (v) => <span style={{ fontSize: 13 }}>{(v as number).toLocaleString()}</span>,
    },
    {
      key: "cost",
      title: "费用",
      dataIndex: "cost",
      render: (v) => <span style={{ fontSize: 13 }}>¥{v as string}</span>,
    },
    {
      key: "status",
      title: "状态",
      render: (_, r) => {
        const row = r as DetailRow;
        return row.status === "success"
          ? <StatusBadge status="success">成功</StatusBadge>
          : <StatusBadge status="danger">{row.status_code || "错误"}</StatusBadge>;
      },
    },
  ];

  /* ---------- render ---------- */

  const d = statsQ.data;

  return (
    <div>
      {/* header */}
      <h2 style={{ margin: "0 0 20px", display: "flex", alignItems: "center", gap: 8 }}>
        消费明细
        <HelpIcon text="查看 API 调用 Token 明细与消费统计。支持按时间、厂商、模型、Key、状态筛选。图表可切换 Token量/费用/调用次数维度，点击图例显示/隐藏模型曲线。" level="page" />
      </h2>

      {/* ── TIME FILTER ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {TIME_RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setTimeRange(r.value)}
            style={{
              padding: "6px 16px", borderRadius: 6, border: "1px solid #d9d9d9",
              background: timeRange === r.value ? "#4f6ef7" : "#fff",
              color: timeRange === r.value ? "#fff" : "#888",
              fontSize: 13, cursor: "pointer",
            }}
          >
            {r.label}
          </button>
        ))}
        <div style={{ display: timeRange === "custom" ? "flex" : "none", alignItems: "center", gap: 6 }}>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid #d9d9d9", fontSize: 13, width: 120 }} />
          <span style={{ color: "#888", fontSize: 13 }}>至</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid #d9d9d9", fontSize: 13, width: 120 }} />
          <button style={btnPrimary}>应用</button>
        </div>
      </div>

      {/* ── STATS CARDS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        <div style={{ ...card, padding: "16px 20px" }}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
            今日调用次数
            <HelpIcon text="当日 API 总调用次数" level="button" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, color: "#333", ...(animated ? { animation: "countUp .4s ease-out" } : {}) }}>
            {d ? formatNumber(d.summary.today_calls) : "—"}
          </div>
          {d && (
            <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
              <span style={{ color: d.summary.today_calls_change_pct >= 0 ? "#4caf50" : "#e53935" }}>
                {d.summary.today_calls_change_pct >= 0 ? "↑" : "↓"} {Math.abs(d.summary.today_calls_change_pct).toFixed(1)}%
              </span> 较昨日
            </div>
          )}
        </div>

        <div style={{ ...card, padding: "16px 20px" }}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
            本月消费
            <HelpIcon text="当月累计消费金额" level="button" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, color: "#333", ...(animated ? { animation: "countUp .4s ease-out" } : {}) }}>
            {d ? `¥${d.summary.month_cost}` : "—"}
          </div>
          {d && (
            <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
              <span style={{ color: d.summary.month_cost_change_pct <= 0 ? "#4caf50" : "#e53935" }}>
                {d.summary.month_cost_change_pct <= 0 ? "↓" : "↑"} {Math.abs(d.summary.month_cost_change_pct).toFixed(1)}%
              </span> 较上月
            </div>
          )}
        </div>

        <div style={{ ...card, padding: "16px 20px" }}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
            活跃 Key
            <HelpIcon text="今日有调用的 Key 数量 / 总 Key 数" level="button" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, color: "#333", ...(animated ? { animation: "countUp .4s ease-out" } : {}) }}>
            {d ? `${d.summary.active_keys} / ${d.summary.total_keys}` : "—"}
          </div>
          {d && (
            <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{d.summary.success_rate_pct}% 调用成功率</div>
          )}
        </div>

        <div style={{ ...card, padding: "16px 20px" }}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
            总 Token
            <HelpIcon text="选定时间范围内总 Token 消耗量" level="button" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, color: "#333", ...(animated ? { animation: "countUp .4s ease-out" } : {}) }}>
            {d ? d.summary.total_tokens : "—"}
          </div>
          {d && (
            <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>输入 {d.summary.input_tokens} / 输出 {d.summary.output_tokens}</div>
          )}
        </div>
      </div>

      {/* ── TREND CHART ── */}
      <div style={card}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            消费趋势
            <HelpIcon text="切换维度查看 Token量/费用金额/调用次数的趋势变化。支持按小时、按日、按周粒度。" level="button" />
          </h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* granularity */}
            <div style={{ display: "flex", gap: 4, background: "#f5f5f5", borderRadius: 6, padding: 2 }}>
              {GRANULARITY_OPTIONS.map((g) => (
                <button
                  key={g.value}
                  onClick={() => setGranularity(g.value)}
                  style={{
                    padding: "4px 12px", borderRadius: 4, border: "none",
                    background: granularity === g.value ? "#4f6ef7" : "transparent",
                    color: granularity === g.value ? "#fff" : "#888",
                    fontSize: 12, cursor: "pointer",
                  }}
                >
                  {g.label}
                </button>
              ))}
            </div>
            {/* dimension */}
            <div style={{ display: "flex", gap: 4, background: "#f5f5f5", borderRadius: 6, padding: 2 }}>
              {DIM_OPTIONS.map((dim) => (
                <button
                  key={dim.value}
                  onClick={() => setDimension(dim.value)}
                  style={{
                    padding: "4px 12px", borderRadius: 4, border: "none",
                    background: dimension === dim.value ? "#4f6ef7" : "transparent",
                    color: dimension === dim.value ? "#fff" : "#888",
                    fontSize: 12, cursor: "pointer",
                  }}
                >
                  {dim.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: "16px 20px" }}>
          <div style={{ position: "relative", width: "100%", height: 300 }}>
            {statsQ.isLoading ? (
              <SkeletonGroup lines={6} />
            ) : !d ? (
              <EmptyState icon="📊" title="暂无数据" description="选择时间范围查看消费趋势（后端接口待实现）" />
            ) : (
              <canvas ref={trendCanvasRef} />
            )}
          </div>

          {/* legend toggle */}
          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#888", marginRight: 8, display: "flex", alignItems: "center", gap: 4 }}>
              模型分布
              <HelpIcon text="点击切换显示/隐藏对应模型曲线" level="button" />
            </span>
            {Object.entries(MODEL_COLORS).map(([name, color]) => (
              <div
                key={name}
                onClick={() => toggleModel(name)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px",
                  borderRadius: 12, background: activeModels.has(name) ? "#eef1ff" : "#f5f5f5",
                  border: `1px solid ${activeModels.has(name) ? "#4f6ef7" : "#d9d9d9"}`,
                  fontSize: 12, color: activeModels.has(name) ? "#333" : "#888",
                  cursor: "pointer",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                {name}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── DETAIL TABLE ── */}
      <div style={card}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #eee" }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            调用明细
            <HelpIcon text="查询条件筛选后展示 API 调用 Token 明细记录。可按厂商、模型、Key、状态过滤。" level="button" />
          </h3>
        </div>
        <div style={{ padding: "16px 20px" }}>
          {/* filter bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{ color: "#888", fontSize: 13, whiteSpace: "nowrap" }}>查询条件</span>
            <select style={filterSelect} value={filterSupplier} onChange={(e) => { setFilterSupplier(e.target.value); setFilterModel(""); setPage(1); }}>
              {SUPPLIER_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select style={filterSelect} value={filterModel} onChange={(e) => { setFilterModel(e.target.value); setPage(1); }}>
              <option value="">全部模型</option>
              {Object.entries(MODEL_COLORS).map(([name]) => <option key={name} value={name}>{name}</option>)}
            </select>
            <select style={filterSelect} value={filterKey} onChange={(e) => { setFilterKey(e.target.value); setPage(1); }}>
              <option value="">全部 Key</option>
              {/* TODO(后端缺失): GET /me/api-keys/lite — Key 列表下拉 */}
              {/* Key 列表由后端接口动态加载 */}
            </select>
            <select style={filterSelect} value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}>
              <option value="">全部状态</option>
              <option value="success">成功</option>
              <option value="fail">失败</option>
            </select>
            <button
              onClick={() => { setFilterSupplier(""); setFilterModel(""); setFilterKey(""); setFilterStatus(""); setPage(1); }}
              style={{ padding: "4px 12px", borderRadius: 4, border: "1px solid #d9d9d9", background: "transparent", color: "#888", fontSize: 12, cursor: "pointer" }}
            >
              重置
            </button>
          </div>

          {/* table */}
          {statsQ.isLoading ? (
            <SkeletonGroup lines={8} />
          ) : !d ? (
            <EmptyState icon="📋" title="暂无数据" description="选择筛选条件查看调用明细（后端接口待实现）" />
          ) : (
            <>
              <Table
                columns={detailColumns}
                dataSource={d.details ?? []}
                loading={statsQ.isLoading}
                emptyText="暂无调用记录"
              />
              <div style={{ marginTop: 16 }}>
                <Pagination
                  current={page}
                  total={d.detail_total}
                  pageSize={pageSize}
                  onChange={(p, s) => { setPage(p); setPageSize(s); }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── MODEL RANKING ── */}
      <div style={card}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            🏆 模型调用排行
            <HelpIcon text="按费用金额降序排列的模型调用排名" level="button" />
          </h3>
          <span style={{ color: "#888", fontSize: 12 }}>按费用金额降序</span>
        </div>
        <div style={{ padding: "16px 20px", display: "flex", gap: 24 }}>
          <div style={{ flex: 1 }}>
            {!d?.model_ranking ? (
              <EmptyState icon="🏆" title="暂无排行数据" description="选择时间范围查看模型调用排名（后端接口待实现）" />
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "8px 10px", color: "#888", fontWeight: 500, borderBottom: "1px solid #eee" }}>#</th>
                    <th style={{ textAlign: "left", padding: "8px 10px", color: "#888", fontWeight: 500, borderBottom: "1px solid #eee" }}>模型</th>
                    <th style={{ textAlign: "left", padding: "8px 10px", color: "#888", fontWeight: 500, borderBottom: "1px solid #eee" }}>调用次数</th>
                    <th style={{ textAlign: "right", padding: "8px 10px", color: "#888", fontWeight: 500, borderBottom: "1px solid #eee" }}>Token 量</th>
                    <th style={{ textAlign: "right", padding: "8px 10px", color: "#888", fontWeight: 500, borderBottom: "1px solid #eee" }}>费用</th>
                    <th style={{ textAlign: "right", padding: "8px 10px", color: "#888", fontWeight: 500, borderBottom: "1px solid #eee" }}>占比</th>
                  </tr>
                </thead>
                <tbody>
                  {d.model_ranking.map((r) => (
                    <tr key={r.rank} style={{ borderBottom: "1px solid #f5f5f5" }}>
                      <td style={{ padding: "8px 10px", color: "#333" }}>{r.rank}</td>
                      <td style={{ padding: "8px 10px", color: "#333" }}>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: r.color, marginRight: 4 }} />
                        {r.model_name}
                      </td>
                      <td style={{ padding: "8px 10px", color: "#333" }}>{r.calls.toLocaleString()}</td>
                      <td style={{ padding: "8px 10px", color: "#333", textAlign: "right" }}>{formatNumber(r.tokens)}</td>
                      <td style={{ padding: "8px 10px", color: "#333", textAlign: "right" }}>¥{r.cost}</td>
                      <td style={{ padding: "8px 10px", color: "#333", textAlign: "right" }}>{r.pct}%</td>
                    </tr>
                  ))}
                  {/* total row */}
                  {d.model_ranking.length > 0 && (
                    <tr style={{ background: "#fafafa", fontWeight: 600 }}>
                      <td style={{ padding: "8px 10px" }} colSpan={2}>合计</td>
                      <td style={{ padding: "8px 10px" }}>
                        {d.model_ranking.reduce((s, r) => s + r.calls, 0).toLocaleString()}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right" }}>
                        {formatNumber(d.model_ranking.reduce((s, r) => s + r.tokens, 0))}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right" }}>
                        ¥{d.model_ranking.reduce((s, r) => s + parseFloat(r.cost), 0).toFixed(1)}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right" }}>100%</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ width: 200, height: 200 }}>
            <canvas ref={donutCanvasRef} />
          </div>
        </div>
      </div>

      {/* ── FAIL STATS ── */}
      <div style={card}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #eee" }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            ❌ 失败统计
            <HelpIcon text="统计筛选范围内调用失败率和错误码分布" level="button" />
          </h3>
        </div>
        <div style={{ padding: "16px 20px" }}>
          {!d?.fail_stats ? (
            <EmptyState icon="✅" title="暂无失败统计" description="选择时间范围查看失败统计（后端接口待实现）" />
          ) : (
            <div style={{ display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 32, fontWeight: 600, color: "#333" }}>
                  {d.fail_rate_pct}%
                </div>
                <div style={{ fontSize: 12, color: "#888" }}>成功调用率</div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, flex: 1 }}>
                {d.fail_stats.map((f) => (
                  <div key={f.code} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#333" }}>
                    <span>{f.label}</span>
                    <div style={{ width: 80, height: 6, borderRadius: 3, background: "#f0f0f0", overflow: "hidden" }}>
                      <div style={{
                        width: `${f.pct}%`, height: "100%", borderRadius: 3,
                        background: f.code === 401 ? "#66bb6a" : f.code === 429 ? "#ffa726" : f.code === 500 ? "#ef5350" : "#888",
                      }} />
                    </div>
                    <span style={{ color: "#888", fontSize: 12 }}>{f.count}次</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── EXPORT BAR ── */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <button
          onClick={handleExportCSV}
          style={{ padding: "7px 16px", borderRadius: 6, border: "1px solid #4f6ef7", background: "#fff", color: "#4f6ef7", fontSize: 13, cursor: "pointer" }}
        >
          导出 CSV
          <HelpIcon text="导出当前筛选条件下的数据为 CSV 格式" level="button" />
        </button>
        <button
          onClick={handleExportExcel}
          style={{ padding: "7px 16px", borderRadius: 6, border: "1px solid #4f6ef7", background: "#fff", color: "#4f6ef7", fontSize: 13, cursor: "pointer" }}
        >
          导出 Excel
          <HelpIcon text="导出当前筛选条件下的数据为 Excel 格式" level="button" />
        </button>
      </div>
    </div>
  );
}
