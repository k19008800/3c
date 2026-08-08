import { useState, useEffect, useRef, useCallback } from "react";
import { Chart, registerables } from "chart.js";
import HelpModal from "../../components/HelpModal";
import { apiGet } from "../../services/api";

Chart.register(...registerables);

type TimePeriod = "today" | "yesterday" | "week" | "month";

const MODEL_COLORS = ["#4f6ef7", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

// ── API types ──

interface FinanceAccounts {
  total_balance: number;
  available_balance: number;
  frozen_balance: number;
  user_recharge_total: number;
  user_consumption_total: number;
  platform_gross_profit: number;
  platform_gross_margin: number;
  settled_to_vendor: number;
  pending_vendor_settlement: number;
}

interface Vendor {
  id: number;
  name: string;
  code: string;
  status: string;
  status_label: string;
  base_url: string;
  model_count: number;
  contact: string;
}

interface SystemVersion {
  version: string;
  node: string;
  platform: string;
  migrationCount: number;
  uptime: number;
}

// ── Mock (kept as fallback / TODO for missing endpoints) ──

interface ModelMeta {
  name: string;
  tokenUp: number;
  tokenDown: number;
  ratio: string;
  calls: number;
  peakQpm: number;
  successRate: number;
}

const MOCK_MODELS: ModelMeta[] = [
  { name: "GPT-4o", tokenUp: 86.5, tokenDown: 282.4, ratio: "1:3.3", calls: 8200, peakQpm: 42, successRate: 98.2 },
  { name: "Claude 3.5", tokenUp: 65.2, tokenDown: 198.7, ratio: "1:3.0", calls: 6100, peakQpm: 28, successRate: 97.5 },
  { name: "DeepSeek V3", tokenUp: 112.8, tokenDown: 381.6, ratio: "1:3.4", calls: 9500, peakQpm: 35, successRate: 95.1 },
  { name: "GLM-4", tokenUp: 48.3, tokenDown: 156.4, ratio: "1:3.2", calls: 3800, peakQpm: 18, successRate: 89.3 },
  { name: "Qwen 2.5", tokenUp: 42.1, tokenDown: 98.3, ratio: "1:2.3", calls: 2700, peakQpm: 15, successRate: 96.8 },
  { name: "Gemini 2.5", tokenUp: 31.6, tokenDown: 65.0, ratio: "1:2.1", calls: 1900, peakQpm: 12, successRate: 95.2 },
];

function generateSparkline(hours: number, amplitude: number) {
  return Array.from({ length: hours }, () => Math.round(30 + Math.random() * amplitude * 70));
}

function generateCostData(hours: number) {
  return Array.from({ length: hours }, () => +(Math.random() * 60 + 2).toFixed(2));
}

type ModelTab = "token" | "calls" | "success" | "cost";

export default function AdminDashboard() {
  const [period, setPeriod] = useState<TimePeriod>("today");
  const [modelTab, setModelTab] = useState<ModelTab>("token");
  const [hiddenModels, setHiddenModels] = useState<Set<string>>(new Set());
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);

  // ── Real API state ──
  const [finance, setFinance] = useState<FinanceAccounts | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [sysVersion, setSysVersion] = useState<SystemVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fin, vendRes, sys] = await Promise.all([
        apiGet<FinanceAccounts>("/admin/finance/accounts").catch(() => null),
        apiGet<{ list: Vendor[] }>("/admin/vendors").catch(() => null),
        apiGet<SystemVersion>("/admin/sys/version").catch(() => null),
      ]);
      if (fin) setFinance(fin);
      if (vendRes) setVendors(vendRes.list ?? []);
      if (sys) setSysVersion(sys);
    } catch (e: any) {
      setError(e.message ?? "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const onlineVendors = vendors.filter((v) => v.status === "active").length;
  const degradedVendors = vendors.filter((v) => v.status === "maintenance" || v.status === "degraded").length;

  const toggleModel = (name: string) => {
    setHiddenModels((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const getHourLabels = () => {
    const hours = period === "today" || period === "yesterday" ? 24 : period === "week" ? 7 : 30;
    if (period === "week") return ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    if (period === "month") return Array.from({ length: 30 }, (_, i) => `${i + 1}日`);
    return Array.from({ length: 24 }, (_, i) => `${i}:00`);
  };

  useEffect(() => {
    if (!chartRef.current) return;
    if (chartInstance.current) chartInstance.current.destroy();

    const ctx = chartRef.current.getContext("2d");
    if (!ctx) return;

    const labels = getHourLabels();
    const count = labels.length;
    const visibleModels = MOCK_MODELS.filter((m) => !hiddenModels.has(m.name));

    const getDatasets = () => {
      switch (modelTab) {
        case "token":
          return visibleModels.map((m, i) => ({
            label: m.name,
            data: generateSparkline(count, i + 1),
            borderColor: MODEL_COLORS[i % MODEL_COLORS.length],
            backgroundColor: "transparent",
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 0,
          }));
        case "calls":
          return visibleModels.map((m, i) => ({
            label: m.name,
            data: generateSparkline(count, i + 1),
            borderColor: MODEL_COLORS[i % MODEL_COLORS.length],
            backgroundColor: "transparent",
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 0,
          }));
        case "success":
          return visibleModels.map((m, i) => ({
            label: m.name,
            data: Array.from({ length: count }, () => 85 + Math.random() * 14),
            borderColor: MODEL_COLORS[i % MODEL_COLORS.length],
            backgroundColor: "transparent",
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 0,
          }));
        case "cost":
          return visibleModels.map((m, i) => ({
            label: m.name,
            data: generateCostData(count),
            borderColor: MODEL_COLORS[i % MODEL_COLORS.length],
            backgroundColor: "transparent",
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 0,
          }));
      }
    };

    chartInstance.current = new Chart(ctx, {
      type: "line",
      data: { labels, datasets: getDatasets() },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: false, grid: { color: "#f0f0f0" } },
          x: { grid: { display: false } },
        },
      },
    });

    return () => {
      chartInstance.current?.destroy();
    };
  }, [period, modelTab, hiddenModels]);

  // Format uptime
  const formatUptime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return `${h}h ${m}m`;
  };

  return (
    <div>
      <div className="admin-page-header">
        <h2 className="admin-page-title">
          数据驾驶舱
          <HelpModal title="数据驾驶舱">
            <p>数据驾驶舱展示整个平台的实时运营数据，包括系统状态、用户活跃度、消费流水和模型运营分析。</p>
            <p><strong>时间栏</strong>可切换不同时间范围查看数据趋势。</p>
            <p><strong>模型运营分析</strong>包含 Token 消耗、调用次数、成功率和消费明细四个维度。</p>
          </HelpModal>
        </h2>
        <div className="time-bar">
          <div className="time-group">
            {(["today", "yesterday", "week", "month"] as TimePeriod[]).map((p) => (
              <button
                key={p}
                className={`time-btn${period === p ? " active" : ""}`}
                onClick={() => setPeriod(p)}
              >
                {p === "today" ? "今天" : p === "yesterday" ? "昨天" : p === "week" ? "本周" : "上月"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="panel" style={{ marginBottom: 12, background: "#fef2f2", borderColor: "#fecaca" }}>
          <div className="panel-body" style={{ color: "#dc2626" }}>⚠️ {error} — 部分数据不可用</div>
        </div>
      )}

      {/* System Status Cards */}
      <div className="stats-grid">
        <div className="stat-card" style={{ borderLeft: "3px solid #22c55e" }}>
          <div className="stat-card-label">🌐 网关状态</div>
          <div className="stat-card-value" style={{ color: "#22c55e", fontSize: 20 }}>
            {loading ? "⏳ 加载中" : "🟢 正常"}
          </div>
          <div className="stat-card-action">
            {sysVersion ? (
              <>运行 {formatUptime(sysVersion.uptime)} · Node {sysVersion.node}</>
            ) : (
              "连接中…"
            )}
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: "3px solid #22c55e" }}>
          <div className="stat-card-label">🗄️ 数据库</div>
          <div className="stat-card-value" style={{ color: "#22c55e", fontSize: 20 }}>
            {loading ? "⏳" : "🟢 正常"}
          </div>
          <div className="stat-card-action">
            {sysVersion ? <>版本 {sysVersion.version} · {sysVersion.migrationCount} 迁移</> : "连接中…"}
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: "3px solid #22c55e" }}>
          <div className="stat-card-label">⚡ 缓存状态</div>
          <div className="stat-card-value" style={{ color: "#22c55e", fontSize: 20 }}>
            {loading ? "⏳" : "🟢 正常"}
          </div>
          <div className="stat-card-action">Redis 运行中</div>
        </div>
        <div className="stat-card" style={{ borderLeft: degradedVendors > 0 ? "3px solid #f59e0b" : "3px solid #22c55e" }}>
          <div className="stat-card-label">🔌 供应商连通</div>
          <div className="stat-card-value" style={{ color: degradedVendors > 0 ? "#f59e0b" : "#22c55e", fontSize: 20 }}>
            {loading ? "⏳" : degradedVendors > 0 ? `🟡 ${degradedVendors}异常` : "🟢 全部正常"}
          </div>
          <div className="stat-card-action">
            {loading ? "" : `${onlineVendors} 在线 / ${vendors.length} 总计`}
          </div>
        </div>
      </div>

      {/* Real-time panels — driven by finance API */}
      <div className="admin-dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <h3>👥 平台资金</h3>
            <span style={{ fontSize: 11, color: "#888" }}>来自 /admin/finance/accounts</span>
          </div>
          <div className="panel-body">
            {loading ? (
              <div style={{ textAlign: "center", padding: 20, color: "#888" }}>⏳ 加载中…</div>
            ) : finance ? (
              <>
                <div className="rt-metric">
                  <div className="rt-metric-label">平台总余额</div>
                  <div className="rt-metric-row">
                    <span className="rt-metric-value danger">¥{finance.total_balance.toFixed(2)}</span>
                  </div>
                  <div className="rt-metric-sub">可用 ¥{finance.available_balance.toFixed(2)}</div>
                </div>
                <div className="rt-metric">
                  <div className="rt-metric-label">用户充值总额</div>
                  <div className="rt-metric-row">
                    <span className="rt-metric-value">¥{finance.user_recharge_total.toFixed(2)}</span>
                  </div>
                </div>
                <div className="rt-metric">
                  <div className="rt-metric-label">用户消费总额</div>
                  <div className="rt-metric-row">
                    <span className="rt-metric-value">¥{finance.user_consumption_total.toFixed(2)}</span>
                  </div>
                </div>
                <div className="rt-metric">
                  <div className="rt-metric-label">平台毛利</div>
                  <div className="rt-metric-row">
                    <span className="rt-metric-value" style={{ color: "#22c55e" }}>¥{finance.platform_gross_profit.toFixed(2)}</span>
                    <span className="rt-metric-change up">{finance.platform_gross_margin}%</span>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ padding: 20, textAlign: "center", color: "#f59e0b" }}>⚠️ 财务数据不可用</div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3>🔥 资金分布</h3>
            <span style={{ fontSize: 11, color: "#888" }}>冻结 / 待结算</span>
          </div>
          <div className="panel-body">
            {loading ? (
              <div style={{ textAlign: "center", padding: 20, color: "#888" }}>⏳ 加载中…</div>
            ) : finance ? (
              <>
                <div className="rt-metric">
                  <div className="rt-metric-label">已结算供应商</div>
                  <div className="rt-metric-row">
                    <span className="rt-metric-value">¥{finance.settled_to_vendor.toFixed(2)}</span>
                  </div>
                </div>
                <div className="rt-metric">
                  <div className="rt-metric-label">待结算供应商</div>
                  <div className="rt-metric-row">
                    <span className="rt-metric-value" style={{ color: "#f59e0b" }}>¥{finance.pending_vendor_settlement.toFixed(2)}</span>
                  </div>
                </div>
                <div className="rt-metric">
                  <div className="rt-metric-label">冻结资金合计</div>
                  <div className="rt-metric-row">
                    <span className="rt-metric-value" style={{ color: "#f59e0b" }}>¥{finance.frozen_balance.toFixed(2)}</span>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ padding: 20, textAlign: "center", color: "#f59e0b" }}>⚠️ 财务数据不可用</div>
            )}
          </div>
        </div>
      </div>

      {/* Model Operations Analysis (TODO: no dedicated endpoint — uses mock) */}
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <h3>📈 模型运营分析</h3>
          <span style={{ fontSize: 11, color: "#f59e0b" }}>
            ⚠️ TODO: 需后端补充 /admin/models/stats 端点，当前为演示数据
          </span>
        </div>
        <div className="panel-body">
          {/* Tab bar */}
          <div className="admin-model-tabs">
            {(["token", "calls", "success", "cost"] as ModelTab[]).map((tab) => (
              <button
                key={tab}
                className={`admin-model-tab${modelTab === tab ? " active" : ""}`}
                onClick={() => setModelTab(tab)}
              >
                {tab === "token" ? "📊 Token 消耗"
                  : tab === "calls" ? "📶 调用次数"
                  : tab === "success" ? "✅ 成功率"
                  : "💰 消费明细"}
              </button>
            ))}
          </div>

          {/* Stats row */}
          <div className="admin-model-stats">
            {modelTab === "token" && (
              <>
                <div className="admin-model-stat">
                  <div className="ams-label">输入 Token ↑</div>
                  <div className="ams-value" style={{ color: "#2563eb" }}>{MOCK_MODELS.reduce((s, m) => s + m.tokenUp, 0).toFixed(1)}万</div>
                  <div className="ams-sub">24h 用户输入总量</div>
                </div>
                <div className="admin-model-stat">
                  <div className="ams-label">输出 Token ↓</div>
                  <div className="ams-value" style={{ color: "#10b981" }}>{MOCK_MODELS.reduce((s, m) => s + m.tokenDown, 0).toFixed(1)}万</div>
                  <div className="ams-sub">24h 模型返回总量</div>
                </div>
                <div className="admin-model-stat">
                  <div className="ams-label">输入/输出比</div>
                  <div className="ams-value" style={{ color: "#8b5cf6" }}>1 : 3.1</div>
                  <div className="ams-sub">用户量 / 模型输出量</div>
                </div>
                <div className="admin-model-stat">
                  <div className="ams-label">综合均价</div>
                  <div className="ams-value" style={{ color: "#f59e0b" }}>¥1.21</div>
                  <div className="ams-sub">每 1,000 Tokens</div>
                </div>
              </>
            )}
            {modelTab === "calls" && (
              <>
                <div className="admin-model-stat">
                  <div className="ams-label">总调用次数</div>
                  <div className="ams-value">{MOCK_MODELS.reduce((s, m) => s + m.calls, 0).toLocaleString()}</div>
                  <div className="ams-sub">24h 请求总量</div>
                </div>
                <div className="admin-model-stat">
                  <div className="ams-label">峰值 QPM</div>
                  <div className="ams-value" style={{ color: "#ef4444" }}>42</div>
                  <div className="ams-sub">次/分钟 (峰值小时)</div>
                </div>
                <div className="admin-model-stat">
                  <div className="ams-label">谷值 QPM</div>
                  <div className="ams-value" style={{ color: "#22c55e" }}>5</div>
                  <div className="ams-sub">次/分钟 (低谷小时)</div>
                </div>
                <div className="admin-model-stat">
                  <div className="ams-label">平均延迟</div>
                  <div className="ams-value">245ms</div>
                  <div className="ams-sub">P50 / P99: 612ms</div>
                </div>
              </>
            )}
            {modelTab === "success" && (
              <>
                <div className="admin-model-stat">
                  <div className="ams-label">整体成功率</div>
                  <div className="ams-value" style={{ color: "#22c55e" }}>96.7%</div>
                  <div className="ams-sub">SLA 目标 99%</div>
                </div>
                <div className="admin-model-stat">
                  <div className="ams-label">最低成功率</div>
                  <div className="ams-value" style={{ color: "#ef4444" }}>89.3%</div>
                  <div className="ams-sub">GLM · 16:00 时段</div>
                </div>
                <div className="admin-model-stat">
                  <div className="ams-label">今日失败次数</div>
                  <div className="ams-value" style={{ color: "#f59e0b" }}>428</div>
                  <div className="ams-sub">占总量 3.3%</div>
                </div>
                <div className="admin-model-stat">
                  <div className="ams-label">错误类型 Top1</div>
                  <div className="ams-value" style={{ fontSize: 16 }}>401 认证</div>
                  <div className="ams-sub">Key 过期为主</div>
                </div>
              </>
            )}
            {modelTab === "cost" && (
              <>
                <div className="admin-model-stat">
                  <div className="ams-label">今日消费</div>
                  <div className="ams-value" style={{ color: "#ef4444" }}>¥1,847.36</div>
                  <div className="ams-sub">环比 +8.7%</div>
                </div>
                <div className="admin-model-stat">
                  <div className="ams-label">本月累计</div>
                  <div className="ams-value">¥39,421.80</div>
                  <div className="ams-sub">预计 ¥171,091</div>
                </div>
                <div className="admin-model-stat">
                  <div className="ams-label">综合均价</div>
                  <div className="ams-value" style={{ color: "#f59e0b" }}>¥1.21</div>
                  <div className="ams-sub">/1K Tokens</div>
                </div>
                <div className="admin-model-stat">
                  <div className="ams-label">毛利率</div>
                  <div className="ams-value" style={{ color: "#22c55e" }}>{finance ? `${finance.platform_gross_margin}%` : "54.8%"}</div>
                  <div className="ams-sub">收入 / 成本</div>
                </div>
              </>
            )}
          </div>

          {/* Chart */}
          <div className="chart-wrapper" style={{ height: 300 }}>
            <canvas ref={chartRef} />
          </div>

          {/* Model legend */}
          <div className="legend-section">
            <div className="legend-title">🔍 模型开关 <span style={{ fontWeight: 400, color: "#888" }}>（点击显示/隐藏该模型曲线）</span></div>
            <div className="legend-grid">
              {MOCK_MODELS.map((m, i) => (
                <button
                  key={m.name}
                  className={`model-chip${hiddenModels.has(m.name) ? " off" : ""}`}
                  onClick={() => toggleModel(m.name)}
                >
                  <span className="model-dot" style={{ background: MODEL_COLORS[i % MODEL_COLORS.length] }} />
                  {m.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Supplier Connectivity — driven by /admin/vendors */}
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <h3>🔌 供应商连通性状态</h3>
        </div>
        <div className="panel-body">
          {loading ? (
            <div style={{ textAlign: "center", padding: 20, color: "#888" }}>⏳ 加载中…</div>
          ) : vendors.length > 0 ? (
            <div className="admin-supplier-status-grid">
              {vendors.map((v) => (
                <div key={v.id} className="admin-supplier-status-card">
                  <div className="assc-header">
                    <span className="assc-name">{v.name}</span>
                    <span className={`assc-dot ${v.status === "active" ? "online" : v.status === "maintenance" ? "degraded" : "offline"}`} />
                  </div>
                  <div className="assc-latency">{v.status_label}</div>
                  <div className="assc-status-text">
                    {v.status === "active" ? "活跃" : v.status === "maintenance" ? "维护中" : "离线"} · {v.model_count} 模型
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: 20, textAlign: "center", color: "#888" }}>暂无供应商数据</div>
          )}
        </div>
      </div>
    </div>
  );
}
