import { useState, useEffect, useRef } from "react";
import AdminLayout from "../../components/AdminLayout";
import HelpModal from "../../components/HelpModal";
import { apiGet, apiPost } from "../../services/api";
import { Chart, registerables } from "chart.js";

Chart.register(...registerables);

// ── Types ──
interface SystemStatus {
  cpu: number;
  memory: number;
  disk: number;
  apiLatency: number;
  activeUsers: number;
  totalRequests: number;
  errorRate: number;
  uptime: string;
}

interface RealTimeUser {
  id: string;
  name: string;
  model: string;
  tokens: number;
  cost: number;
  status: "active" | "queued";
}

interface ModelStatus {
  id: string;
  name: string;
  provider: string;
  enabled: boolean;
  healthy: boolean;
  latency: number;
  qps: number;
  successRate: number;
}

interface ApiAlert {
  id: string;
  type: string;
  severity: string;
  message: string;
  timestamp: string;
  acknowledged: boolean;
  resolved: boolean;
  value?: number;
  threshold?: number;
}

interface AlertUI {
  id: string;
  level: "critical" | "warning" | "info";
  message: string;
  time: string;
  acked: boolean;
}

// ── Mock Data (for sections without live API) ──
const MOCK_SYSTEM: SystemStatus = {
  cpu: 42,
  memory: 68,
  disk: 55,
  apiLatency: 87,
  activeUsers: 1256,
  totalRequests: 892450,
  errorRate: 0.32,
  uptime: "15d 7h 23m",
};

const MOCK_USERS: RealTimeUser[] = [
  { id: "1", name: "user_a8f2", model: "GPT-4o", tokens: 4500, cost: 0.45, status: "active" },
  { id: "2", name: "user_c3d1", model: "Claude 3.5 Sonnet", tokens: 12000, cost: 1.8, status: "active" },
  { id: "3", name: "user_e7b4", model: "Gemini 2.0 Flash", tokens: 2300, cost: 0.09, status: "queued" },
  { id: "4", name: "user_f2a9", model: "DeepSeek-V3", tokens: 8900, cost: 0.27, status: "active" },
  { id: "5", name: "user_h6c8", model: "GPT-4o Mini", tokens: 34000, cost: 0.51, status: "active" },
];

const MOCK_MODELS: ModelStatus[] = [
  { id: "1", name: "GPT-4o", provider: "OpenAI", enabled: true, healthy: true, latency: 85, qps: 120, successRate: 99.8 },
  { id: "2", name: "GPT-4o Mini", provider: "OpenAI", enabled: true, healthy: true, latency: 45, qps: 320, successRate: 99.9 },
  { id: "3", name: "Claude 3.5 Sonnet", provider: "Anthropic", enabled: true, healthy: true, latency: 92, qps: 85, successRate: 99.5 },
  { id: "4", name: "Claude 3 Opus", provider: "Anthropic", enabled: false, healthy: false, latency: 0, qps: 0, successRate: 0 },
  { id: "5", name: "Gemini 2.0 Flash", provider: "Google", enabled: true, healthy: true, latency: 38, qps: 250, successRate: 99.7 },
  { id: "6", name: "DeepSeek-V3", provider: "DeepSeek", enabled: true, healthy: true, latency: 65, qps: 180, successRate: 99.6 },
];

const ALERT_LEVEL: Record<string, { cls: string; label: string }> = {
  critical: { cls: "badge-danger", label: "严重" },
  warning: { cls: "badge-warning", label: "警告" },
  info: { cls: "badge-info", label: "信息" },
};

// ── Chart Components ──
function QpsChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const labels = Array.from({ length: 24 }, (_, i) => `${i}:00`.padStart(5, "0"));
    chartRef.current = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "GPT-4o", data: labels.map(() => Math.floor(Math.random() * 80 + 40)), borderColor: "#4f6ef7", tension: 0.3, fill: false },
          { label: "Claude 3.5", data: labels.map(() => Math.floor(Math.random() * 60 + 30)), borderColor: "#22c55e", tension: 0.3, fill: false },
          { label: "Gemini Flash", data: labels.map(() => Math.floor(Math.random() * 100 + 80)), borderColor: "#f59e0b", tension: 0.3, fill: false },
          { label: "DeepSeek-V3", data: labels.map(() => Math.floor(Math.random() * 70 + 50)), borderColor: "#8b5cf6", tension: 0.3, fill: false },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 12, padding: 16, font: { size: 11 } } } },
        scales: { y: { beginAtZero: true, title: { display: true, text: "QPS" } }, x: { ticks: { maxTicksLimit: 6 } } },
      },
    });
    return () => { chartRef.current?.destroy(); };
  }, []);

  return <div style={{ height: 260 }}><canvas ref={canvasRef} /></div>;
}

function CostChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    const labels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

    chartRef.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "成本 (¥)", data: labels.map(() => Math.floor(Math.random() * 5000 + 3000)), backgroundColor: "#4f6ef780" },
          { label: "收入 (¥)", data: labels.map(() => Math.floor(Math.random() * 8000 + 5000)), backgroundColor: "#22c55e80" },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 12, padding: 16, font: { size: 11 } } } },
        scales: { y: { beginAtZero: true } },
      },
    });
    return () => { chartRef.current?.destroy(); };
  }, []);

  return <div style={{ height: 260 }}><canvas ref={canvasRef} /></div>;
}

// ── Main Component ──
export default function AdminCockpit() {
  const [models, setModels] = useState<ModelStatus[]>(MOCK_MODELS);
  const [alerts, setAlerts] = useState<AlertUI[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [modelTab, setModelTab] = useState<"status" | "qps" | "revenue" | "errors">("status");

  // Load alerts from API
  const loadAlerts = async () => {
    setAlertsLoading(true);
    try {
      const data = await apiGet<{ list: ApiAlert[]; total: number }>("/monitoring/alerts", {
        resolved: "false",
        pageSize: 20,
      });
      const uiAlerts: AlertUI[] = (data.list || []).map((a) => ({
        id: a.id,
        level: (a.severity === "critical" ? "critical" : a.severity === "warning" ? "warning" : "info") as AlertUI["level"],
        message: a.message || `${a.type}: 达到阈值 ${a.value ?? "?"}/${a.threshold ?? "?"}`,
        time: a.timestamp ? new Date(a.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "—",
        acked: a.acknowledged,
      }));
      setAlerts(uiAlerts);
    } catch {
      // Alerts are optional; keep mock fallback empty if API fails
      setAlerts([]);
    } finally {
      setAlertsLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, []);

  const toggleModel = (id: string) => {
    setModels((prev) =>
      prev.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m))
    );
  };

  const ackAlert = async (id: string) => {
    try {
      await apiPost(`/monitoring/alerts/${id}/acknowledge`);
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, acked: true } : a)));
    } catch (e: any) {
      alert(e.message || "确认失败");
    }
  };

  return (
    <AdminLayout>
      <h1 className="page-title">
        数据驾驶舱
        <HelpModal title="数据驾驶舱">
          <p>运营后台实时监控面板，展示系统状态、用户行为、模型运营和告警信息。</p>
          <p style={{ marginTop: 8 }}>📊 五大区块：</p>
          <ul style={{ paddingLeft: 20, marginTop: 4 }}>
            <li>系统状态：CPU、内存、磁盘、API 延迟等关键指标</li>
            <li>实时用户与消费：正在使用平台的用户和消费情况</li>
            <li>模型运营 4 选项卡：状态/并发/收入/错误率</li>
            <li>供应商连通性：各厂商的实时连通状态</li>
            <li>活跃告警：从监控系统加载的实时告警（API: /monitoring/alerts）</li>
          </ul>
        </HelpModal>
      </h1>
      <p className="page-subtitle">实时监控平台运营状态</p>

      {/* Row 1: System Status — TODO: realtime monitoring API */}
      <div
        style={{
          padding: "6px 12px",
          marginBottom: 12,
          borderRadius: "var(--radius-md)",
          background: "var(--color-warning-bg)",
          fontSize: 12,
          color: "var(--color-text-secondary)",
        }}
      >
        {/* TODO: 系统状态指标（CPU/内存/磁盘/延迟）需实时监控 API */}
        ⚠️ 系统状态和用户数据当前使用演示数据。TODO: 集成 GET /admin/monitoring/realtime
      </div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-label">CPU 使用率</div>
          <div className="stat-card-value">{MOCK_SYSTEM.cpu}%</div>
          <div className="stat-card-action">查看详情 →</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">内存使用率</div>
          <div className="stat-card-value">{MOCK_SYSTEM.memory}%</div>
          <div className="stat-card-action">查看详情 →</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">API 平均延迟</div>
          <div className="stat-card-value">{MOCK_SYSTEM.apiLatency}ms</div>
          <div className="stat-card-action">查看详情 →</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">在线用户</div>
          <div className="stat-card-value">{MOCK_SYSTEM.activeUsers}</div>
          <div className="stat-card-action">查看详情 →</div>
        </div>
      </div>

      {/* Row 2: Real-time Users + Consumption */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Real-time Users — TODO: user activity API */}
        <div className="panel">
          <div className="panel-header">👤 实时用户请求</div>
          <div className="panel-body" style={{ maxHeight: 320, overflowY: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>用户</th>
                  <th>模型</th>
                  <th>Tokens</th>
                  <th>费用</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_USERS.map((u) => (
                  <tr key={u.id}>
                    <td><span className="text-mono" style={{ fontSize: 12 }}>{u.name}</span></td>
                    <td>{u.model}</td>
                    <td>{u.tokens.toLocaleString()}</td>
                    <td>¥{u.cost.toFixed(2)}</td>
                    <td>
                      <span className={`badge ${u.status === "active" ? "badge-success" : "badge-warning"}`}>
                        {u.status === "active" ? "处理中" : "排队中"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cost Chart */}
        <div className="panel">
          <div className="panel-header">💰 7日成本/收入</div>
          <div className="panel-body">
            <CostChart />
          </div>
        </div>
      </div>

      {/* Row 3: Model Operations 4-Tab */}
      <div className="panel mb-16">
        <div className="panel-header">
          🤖 模型运营
          <div className="filter-tabs">
            {(["status", "qps", "revenue", "errors"] as const).map((tab) => (
              <button
                key={tab}
                className={`filter-tab${modelTab === tab ? " active" : ""}`}
                onClick={() => setModelTab(tab)}
              >
                {tab === "status" ? "服务状态" : tab === "qps" ? "QPS趋势" : tab === "revenue" ? "收入分布" : "错误率"}
              </button>
            ))}
          </div>
        </div>
        <div className="panel-body">
          {modelTab === "status" ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {models.map((m) => (
                <button
                  key={m.id}
                  className={`btn btn-xs ${m.enabled ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => toggleModel(m.id)}
                  style={{ opacity: m.enabled ? 1 : 0.5 }}
                >
                  {m.enabled ? "🟢" : "🔴"} {m.name}
                </button>
              ))}
            </div>
          ) : null}
          {modelTab === "qps" ? <QpsChart /> : null}
          {modelTab === "status" || modelTab === "revenue" || modelTab === "errors" ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>模型</th>
                  <th>厂商</th>
                  <th>状态</th>
                  <th>健康</th>
                  <th>延迟</th>
                  <th>QPS</th>
                  <th>成功率</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.id} style={{ opacity: m.enabled ? 1 : 0.5 }}>
                    <td><strong>{m.name}</strong></td>
                    <td>{m.provider}</td>
                    <td>
                      <span className={`badge ${m.enabled ? "badge-success" : "badge-danger"}`}>
                        {m.enabled ? "启用" : "停用"}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: m.healthy ? "var(--color-success)" : "var(--color-danger)" }}>
                        ● {m.healthy ? "正常" : "异常"}
                      </span>
                    </td>
                    <td>{m.latency > 0 ? `${m.latency}ms` : "—"}</td>
                    <td>{m.qps}</td>
                    <td>{m.successRate > 0 ? `${m.successRate}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </div>

      {/* Row 4: Alerts — LIVE from /monitoring/alerts */}
      <div className="panel mb-16">
        <div className="panel-header">
          🚨 活跃告警
          {alertsLoading ? (
            <span className="badge badge-info">加载中…</span>
          ) : (
            <span className="badge badge-danger">{alerts.filter((a) => !a.acked).length} 未处理</span>
          )}
          <button
            className="btn btn-xs btn-secondary"
            style={{ marginLeft: 8 }}
            onClick={loadAlerts}
            disabled={alertsLoading}
          >
            🔄 刷新
          </button>
        </div>
        <div className="panel-body">
          {alertsLoading ? (
            <p style={{ textAlign: "center", padding: 20 }}>加载告警数据…</p>
          ) : alerts.length === 0 ? (
            <p style={{ textAlign: "center", padding: 20, color: "var(--color-text-secondary)" }}>
              ✅ 暂无活跃告警
            </p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>级别</th>
                  <th>告警内容</th>
                  <th>时间</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id} style={{ background: a.acked ? undefined : "var(--color-warning-bg)" }}>
                    <td>
                      <span className={`badge ${ALERT_LEVEL[a.level]?.cls || "badge-info"}`}>
                        {ALERT_LEVEL[a.level]?.label || a.level}
                      </span>
                    </td>
                    <td>{a.message}</td>
                    <td>{a.time}</td>
                    <td>
                      <span className={`badge ${a.acked ? "badge-success" : "badge-warning"}`}>
                        {a.acked ? "已处理" : "待处理"}
                      </span>
                    </td>
                    <td>
                      {!a.acked && (
                        <button className="btn btn-xs btn-primary" onClick={() => ackAlert(a.id)}>
                          确认处理
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
