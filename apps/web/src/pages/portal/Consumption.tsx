import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Chart } from "chart.js/auto";
import HelpModal from "../../components/HelpModal";
import api from "../../services/api";

// ── Types ──
type TimeRange = "today" | "yesterday" | "week" | "month" | "custom";
type ChartDim = "tokens" | "cost" | "calls";
type Granularity = "hour" | "day" | "week";

interface UsageCompare {
  current: { calls: number; tokens: number; fails: number; cost: number };
  previous: { calls: number; tokens: number; fails: number; cost: number };
}

interface RecentLog {
  id: number;
  requestId: string;
  modelId: string;
  vendorId: string;
  provider: string;
  requestTokens: number;
  responseTokens: number;
  totalTokens: number;
  costCents: number;
  status: string;
  latencyMs: number;
  createdAt: string;
}

// ── Constants ──
const TIME_RANGES: { key: TimeRange; label: string }[] = [
  { key: "today", label: "今天" },
  { key: "yesterday", label: "昨天" },
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
  { key: "custom", label: "自定义" },
];

const MODEL_COLORS: Record<string, string> = {
  "deepseek-v4": "#10b981",
  "glm5": "#8b5cf6",
  "qwen35": "#2563eb",
  "kimi-k2": "#f59e0b",
  "gpt54": "#ec4899",
};

const MODEL_NAMES: Record<string, string> = {
  "deepseek-v4": "DeepSeek-V4",
  "glm5": "GLM-5.2",
  "qwen35": "Qwen3.5",
  "kimi-k2": "Kimi-K2.5",
  "gpt54": "GPT-5.4",
};

// ── Component ──
export default function Consumption() {
  const [timeRange, setTimeRange] = useState<TimeRange>("week");
  const [dim, setDim] = useState<ChartDim>("tokens");
  const [gran, setGran] = useState<Granularity>("day");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usageCompare, setUsageCompare] = useState<UsageCompare | null>(null);
  const [recentLogs, setRecentLogs] = useState<RecentLog[]>([]);

  // Filters
  const [fModel, setFModel] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const trendChartRef = useRef<HTMLCanvasElement>(null);
  const trendInstRef = useRef<Chart | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [compareRes, logsRes] = await Promise.all([
        api.get<UsageCompare>("/me/stats/usage-compare"),
        api.get<RecentLog[]>("/me/logs/recent?limit=50"),
      ]);
      if (compareRes.error) setError(compareRes.error);
      else setUsageCompare(compareRes.data);
      if (logsRes.data) setRecentLogs(logsRes.data || []);
      setLoading(false);
    }
    load();
  }, []);

  const renderTrend = () => {
    const canvas = trendChartRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (trendInstRef.current) trendInstRef.current.destroy();

    // Chart data from recent logs aggregated by date
    const byDate: Record<string, { tokens: number; cost: number; calls: number }> = {};
    for (const log of recentLogs) {
      const d = log.createdAt?.slice(0, 10) ?? "unknown";
      if (!byDate[d]) byDate[d] = { tokens: 0, cost: 0, calls: 0 };
      byDate[d].tokens += log.totalTokens ?? 0;
      byDate[d].cost += (log.costCents ?? 0) / 100;
      byDate[d].calls += 1;
    }
    const labels = Object.keys(byDate).sort();
    const values = labels.map((l) =>
      dim === "calls" ? byDate[l]!.calls : dim === "cost" ? byDate[l]!.cost : byDate[l]!.tokens
    );

    trendInstRef.current = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels.length > 0 ? labels : ["暂无数据"],
        datasets: [{
          label: dim === "calls" ? "调用次数" : dim === "cost" ? "费用" : "Token",
          data: values,
          borderColor: "#4f6ef7",
          backgroundColor: "rgba(79,110,247,0.1)",
          fill: true,
          tension: 0.35,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: "rgba(100,116,139,0.15)" }, ticks: { font: { size: 10 } } },
          y: {
            grid: { color: "rgba(100,116,139,0.15)" },
            beginAtZero: true,
            ticks: {
              font: { size: 10 },
              callback: (v: any) => dim === "cost" ? "¥" + v : v >= 1000 ? (v / 1000).toFixed(1) + "k" : v,
            },
          },
        },
      },
    });
  };

  useEffect(() => {
    if (!loading && recentLogs.length > 0) {
      setTimeout(renderTrend, 200);
    }
    return () => { trendInstRef.current?.destroy(); };
  }, [loading]);

  // Filter detail
  let filtered = recentLogs.map((l) => ({
    time: l.createdAt,
    model: l.modelId || l.provider || "unknown",
    keySuffix: l.requestId?.slice(0, 12) || "—",
    tokens: l.totalTokens ?? 0,
    cost: (l.costCents ?? 0) / 100,
    status: l.status === "success" ? "success" as const : "fail" as const,
  }));
  if (fModel) filtered = filtered.filter((r) => r.model === fModel);
  if (fStatus) filtered = filtered.filter((r) => r.status === fStatus);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageData = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  if (loading) {
    return (
      <div className="portal-layout">
        <aside className="sidebar">
          <div className="sidebar-logo">3Cloud</div>
          <nav className="sidebar-nav">
            <Link to="/dashboard" className="nav-item">📊 概览</Link>
            <Link to="/billing" className="nav-item">💰 消费明细</Link>
            <Link to="/api-keys" className="nav-item">🔑 API Key</Link>
            <Link to="/playground" className="nav-item">🧪 Playground</Link>
            <Link to="/consumption" className="nav-item active">📈 消费统计</Link>
          </nav>
        </aside>
        <main className="portal-main">
          <div className="loading-container">
            <div className="spinner" />
            <p>加载中...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="portal-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">3Cloud</div>
        <nav className="sidebar-nav">
          <Link to="/dashboard" className="nav-item">📊 概览</Link>
          <Link to="/billing" className="nav-item">💰 消费明细</Link>
          <Link to="/api-keys" className="nav-item">🔑 API Key</Link>
          <Link to="/playground" className="nav-item">🧪 Playground</Link>
          <Link to="/consumption" className="nav-item active">📈 消费统计</Link>
        </nav>
      </aside>

      <main className="portal-main">
        <h1 className="page-title">
          消费统计
          <HelpModal title="消费统计">
            <p>可视化您的 API 消费数据。按时间范围、维度和粒度查看趋势。</p>
          </HelpModal>
        </h1>
        <p className="page-subtitle">通过图表直观了解 API 消费趋势和分布</p>

        {error && <div className="error-banner">⚠️ {error}</div>}

        {/* Time Range */}
        <div className="flex-wrap mb-16">
          {TIME_RANGES.map((t) => (
            <button key={t.key} onClick={() => setTimeRange(t.key)} className={`btn btn-sm ${timeRange === t.key ? "btn-primary" : "btn-secondary"}`} style={timeRange === t.key ? undefined : { padding: "6px 12px" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Stat Cards */}
        {usageCompare && (
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-card-label">本月调用</div>
              <div className="stat-card-value">{usageCompare.current.calls.toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">本月消费</div>
              <div className="stat-card-value">¥{usageCompare.current.cost.toFixed(2)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">上月调用</div>
              <div className="stat-card-value">{usageCompare.previous.calls.toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">上月消费</div>
              <div className="stat-card-value">¥{usageCompare.previous.cost.toFixed(2)}</div>
            </div>
          </div>
        )}

        {/* Trend Chart */}
        <div className="panel mt-16">
          <div className="panel-header">
            <span>📈 消费趋势</span>
            <div className="flex-wrap">
              <div className="filter-tabs">
                {(["tokens", "cost", "calls"] as ChartDim[]).map((d) => (
                  <button key={d} className={`filter-tab ${dim === d ? "active" : ""}`} onClick={() => { setDim(d); setTimeout(renderTrend, 0); }}>
                    {d === "tokens" ? "Token" : d === "cost" ? "费用" : "次数"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="panel-body">
            <div className="chart-container" style={{ height: 280 }}>
              <canvas ref={trendChartRef}></canvas>
            </div>
          </div>
        </div>

        {/* Detail Table */}
        <div className="panel mt-16">
          <div className="panel-header"><span>调用明细</span></div>
          <div className="panel-body">
            <div className="flex-wrap mb-16">
              <select className="form-select" style={{ width: 140 }} value={fModel} onChange={(e) => { setFModel(e.target.value); setPage(1); }}>
                <option value="">全部模型</option>
                {Object.values(MODEL_NAMES).map((n) => (<option key={n} value={n}>{n}</option>))}
              </select>
              <select className="form-select" style={{ width: 120 }} value={fStatus} onChange={(e) => { setFStatus(e.target.value); setPage(1); }}>
                <option value="">全部状态</option>
                <option value="success">成功</option>
                <option value="fail">失败</option>
              </select>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr><th>时间</th><th>模型</th><th>Key</th><th>Token 数</th><th>费用</th><th>状态</th></tr>
                </thead>
                <tbody>
                  {pageData.map((r, i) => (
                    <tr key={i}>
                      <td>{r.time ? new Date(r.time).toLocaleString("zh-CN") : "—"}</td>
                      <td>{r.model}</td>
                      <td><span className="text-mono">{r.keySuffix}</span></td>
                      <td>{r.tokens.toLocaleString()}</td>
                      <td className="text-mono">¥{r.cost.toFixed(4)}</td>
                      <td><span className={`badge ${r.status === "success" ? "badge-success" : "badge-danger"}`}>{r.status === "success" ? "成功" : "失败"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex-between mt-16">
              <span className="text-sm text-muted">共 {filtered.length} 条</span>
              <div className="flex-wrap">
                <button className="btn btn-sm btn-secondary" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>‹</button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const p = safePage <= 3 ? i + 1 : safePage >= totalPages - 2 ? totalPages - 4 + i : safePage - 2 + i;
                  return p >= 1 && p <= totalPages ? (
                    <button key={p} className={`btn btn-sm ${p === safePage ? "btn-primary" : "btn-secondary"}`} style={p === safePage ? undefined : { padding: "6px 12px" }} onClick={() => setPage(p)}>{p}</button>
                  ) : null;
                })}
                <button className="btn btn-sm btn-secondary" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>›</button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
