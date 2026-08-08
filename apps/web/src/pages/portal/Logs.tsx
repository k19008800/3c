import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import PageHeader from "../../components/PageHeader";
import FilterBar from "../../components/FilterBar";
import StatusBadge from "../../components/StatusBadge";
import EmptyState from "../../components/EmptyState";
import type { FilterDef } from "../../components/FilterBar";
import api from "../../services/api";

/* ==================== Types ==================== */

interface LogEntry {
  id: string;
  requestId?: string;
  timestamp?: string;
  model?: string;
  provider?: string;
  upstream_model?: string;
  method?: string;
  status?: "success" | "error" | "rate_limited";
  statusCode?: number;
  tokens?: number;
  request_tokens?: number;
  response_tokens?: number;
  totalTokens?: number;
  total_tokens?: number;
  latency?: number;
  latency_ms?: number;
  cost?: string;
  costCents?: number;
  cost_cents?: number;
  error_code?: string;
}

/* ==================== Helpers ==================== */

const formatLatency = (ms: number) => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const formatTokens = (n: number) => {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
};

const NAV = [
  { to: "/dashboard", icon: "📊", label: "概览" },
  { to: "/team", icon: "👥", label: "团队" },
  { to: "/webhooks", icon: "🔔", label: "Webhooks" },
  { to: "/logs", icon: "📋", label: "日志" },
  { to: "/settings", icon: "⚙️", label: "设置" },
  { to: "/account-deletion", icon: "🗑️", label: "账号注销" },
];

/* ==================== Component ==================== */

export default function Logs() {
  const location = useLocation();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await api.get<{ list: LogEntry[] }>("/me/logs?limit=50");
      if (res.error) {
        setError(res.error);
      } else if (res.data) {
        setLogs(res.data.list || []);
      }
      setLoading(false);
    }
    load();
  }, []);

  const filterDefs: FilterDef[] = useMemo(() => [], []);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filters.search && log.requestId && !log.requestId.includes(filters.search)) return false;
      return true;
    });
  }, [logs, filters]);

  const handleCopy = useCallback(async (requestId: string) => {
    try { await navigator.clipboard.writeText(requestId); } catch {}
    setCopiedId(requestId);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  if (loading) {
    return (
      <div className="portal-layout">
        <aside className="sidebar">
          <div className="sidebar-logo">3Cloud</div>
          <nav className="sidebar-nav">
            {NAV.map((item) => (
              <Link key={item.to} to={item.to} className={`nav-item${location.pathname === item.to ? " active" : ""}`}>
                {item.icon} {item.label}
              </Link>
            ))}
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
          {NAV.map((item) => (
            <Link key={item.to} to={item.to} className={`nav-item${location.pathname === item.to ? " active" : ""}`}>
              {item.icon} {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="portal-main">
        <PageHeader
          title="调用日志"
          helpText="查看 API 调用日志，包括请求时间、模型、Token 用量、延迟和状态。"
        />

        {error && <div className="error-banner">⚠️ {error}</div>}

        <FilterBar filters={filterDefs} onChange={setFilters} />

        {filteredLogs.length === 0 ? (
          <div className="card">
            <EmptyState icon="📋" title="暂无日志" description="还没有 API 调用记录" />
          </div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>模型</th>
                    <th>Token</th>
                    <th>延迟</th>
                    <th>费用</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log, idx) => {
                    const tokens = log.totalTokens ?? log.total_tokens ?? 0;
                    const latency = log.latency ?? log.latency_ms ?? 0;
                    const cost = log.cost
                      ? log.cost
                      : log.costCents !== undefined
                        ? `$${(log.costCents / 100).toFixed(4)}`
                        : log.cost_cents !== undefined
                          ? `$${(log.cost_cents / 100).toFixed(4)}`
                          : "$0.0000";
                    const model = log.model ?? log.upstream_model ?? "unknown";
                    const provider = log.provider ?? "";
                    const requestId = log.requestId ?? log.id;
                    const statusCode = log.statusCode ?? (log.status === "success" ? 200 : 0);
                    const logStatus: LogEntry["status"] = log.status ?? (statusCode === 200 ? "success" : "error");
                    const createdAt = log.timestamp ?? (log as any).created_at ?? "";

                    return (
                      <>
                        <tr key={log.id ?? idx} onClick={() => setExpandedId(expandedId === (log.id ?? String(idx)) ? null : (log.id ?? String(idx)))} style={{ cursor: "pointer" }}>
                          <td style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                            {createdAt ? new Date(createdAt).toLocaleString("zh-CN") : "—"}
                          </td>
                          <td>
                            <div style={{ fontWeight: 500 }}>{model}</div>
                            {provider && <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{provider}</div>}
                          </td>
                          <td>{formatTokens(tokens)}</td>
                          <td>{latency ? formatLatency(latency) : "—"}</td>
                          <td style={{ fontFamily: "monospace", fontSize: 13 }}>{cost}</td>
                          <td>
                            <StatusBadge status={logStatus === "success" ? "success" : logStatus === "rate_limited" ? "warning" : "error"}>
                              {log.error_code ? log.error_code : logStatus === "success" ? "200 OK" : "Error"}
                            </StatusBadge>
                          </td>
                          <td>
                            <button className="btn btn-outline btn-sm" onClick={(e) => { e.stopPropagation(); handleCopy(requestId); }}>
                              {copiedId === requestId ? "✓ 已复制" : "复制 ID"}
                            </button>
                          </td>
                        </tr>
                        {expandedId === (log.id ?? String(idx)) && (
                          <tr key={`${log.id ?? idx}-detail`}>
                            <td colSpan={7} style={{ background: "#f9fafb", padding: "16px 20px" }}>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px", fontSize: 13 }}>
                                <div><span style={{ color: "var(--color-text-secondary)" }}>Request ID：</span><code style={{ fontSize: 12, background: "#fff", padding: "2px 6px", borderRadius: 4 }}>{requestId}</code></div>
                                <div><span style={{ color: "var(--color-text-secondary)" }}>提供方：</span>{provider || "—"}</div>
                                <div><span style={{ color: "var(--color-text-secondary)" }}>Token 用量：</span>{tokens.toLocaleString()}</div>
                                <div><span style={{ color: "var(--color-text-secondary)" }}>延迟：</span>{latency ? formatLatency(latency) : "—"}</div>
                                <div><span style={{ color: "var(--color-text-secondary)" }}>费用：</span><span style={{ fontFamily: "monospace" }}>{cost}</span></div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
