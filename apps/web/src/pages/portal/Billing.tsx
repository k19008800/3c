import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import HelpModal from "../../components/HelpModal";
import api from "../../services/api";

// ── Types ──
interface BillingCurrent {
  period: string;
  total_cost: number;
  bill_count: number;
  days_left: number;
}

interface BillingDayItem {
  day: string;
  cost: number;
}

interface HistoryMonth {
  month: string;
  total_cost: number;
  bill_count: number;
}

interface MonthDetail {
  month: string;
  summary: { total_cost: number; total_refund: number; total_calls: number };
  items: Array<{ price_source: string; cost: number; calls: number; refund: number }>;
  model_items: Array<{ model: string; calls: number; cost: number }>;
}

type FilterPeriod = "today" | "week" | "month" | "custom";

const PERIODS: { key: FilterPeriod; label: string }[] = [
  { key: "today", label: "今天" },
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
  { key: "custom", label: "自定义" },
];

// ── Component ──
export default function Billing() {
  const [period, setPeriod] = useState<FilterPeriod>("month");
  const [startDate, setStartDate] = useState("2026-08-01");
  const [endDate, setEndDate] = useState("2026-08-08");
  const [current, setCurrent] = useState<BillingCurrent | null>(null);
  const [dailyData, setDailyData] = useState<BillingDayItem[]>([]);
  const [history, setHistory] = useState<HistoryMonth[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [monthDetail, setMonthDetail] = useState<MonthDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      const [curRes, dailyRes, histRes] = await Promise.all([
        api.get<BillingCurrent>("/me/billing/current"),
        api.get<{ list: BillingDayItem[] }>("/me/billing/current/daily"),
        api.get<{ list: HistoryMonth[] }>("/me/billing/history"),
      ]);

      if (curRes.error || dailyRes.error || histRes.error) {
        setError(curRes.error || dailyRes.error || histRes.error);
      }
      if (curRes.data) setCurrent(curRes.data);
      if (dailyRes.data) setDailyData(dailyRes.data.list || []);
      if (histRes.data) setHistory(histRes.data.list || []);

      setLoading(false);
    }
    load();
  }, []);

  const loadMonthDetail = async (month: string) => {
    if (selectedMonth === month) {
      setSelectedMonth(null);
      setMonthDetail(null);
      return;
    }
    setSelectedMonth(month);
    const res = await api.get<MonthDetail>(`/me/billing/history/${month}`);
    if (res.data) setMonthDetail(res.data);
  };

  const handleExport = async (month: string) => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const res = await fetch(`/api/v1/me/billing/history/${month}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `billing-${month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const totalMonthlyCost = current?.total_cost ?? 0;

  if (loading) {
    return (
      <div className="portal-layout">
        <aside className="sidebar">
          <div className="sidebar-logo">3Cloud</div>
          <nav className="sidebar-nav">
            <Link to="/dashboard" className="nav-item">📊 概览</Link>
            <Link to="/billing" className="nav-item active">💰 消费明细</Link>
            <Link to="/api-keys" className="nav-item">🔑 API Key</Link>
            <Link to="/playground" className="nav-item">🧪 Playground</Link>
            <Link to="/consumption" className="nav-item">📈 消费统计</Link>
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
          <Link to="/billing" className="nav-item active">💰 消费明细</Link>
          <Link to="/api-keys" className="nav-item">🔑 API Key</Link>
          <Link to="/playground" className="nav-item">🧪 Playground</Link>
          <Link to="/consumption" className="nav-item">📈 消费统计</Link>
        </nav>
      </aside>

      <main className="portal-main">
        <h1 className="page-title">
          消费明细
          <HelpModal title="消费明细">
            <p>查看您的 API 调用消费明细。按日期范围和模型筛选，支持导出 CSV。</p>
          </HelpModal>
        </h1>
        <p className="page-subtitle">查看每笔 API 调用的详细消费记录</p>

        {error && (
          <div className="error-banner">⚠️ {error}</div>
        )}

        {/* Period Filter */}
        <div className="flex-wrap mb-16">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`btn btn-sm ${period === p.key ? "btn-primary" : "btn-secondary"}`}
              style={period === p.key ? undefined : { padding: "6px 12px" }}
            >
              {p.label}
            </button>
          ))}
          {period === "custom" && (
            <>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="form-input" style={{ width: 150 }} />
              <span className="text-muted">至</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="form-input" style={{ width: 150 }} />
            </>
          )}
        </div>

        {/* Summary */}
        {current && (
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-card-label">当前周期</div>
              <div className="stat-card-value">{current.period}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">本月消费</div>
              <div className="stat-card-value">¥{current.total_cost.toFixed(2)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">消费笔数</div>
              <div className="stat-card-value">{current.bill_count.toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">距下期账单</div>
              <div className="stat-card-value">{current.days_left} 天</div>
            </div>
          </div>
        )}

        {/* Daily Chart Data */}
        {dailyData.length > 0 && (
          <div className="panel mt-16">
            <div className="panel-header">
              <span>📊 本月每日消费</span>
            </div>
            <div className="panel-body">
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120 }}>
                {dailyData.slice(-31).map((d) => {
                  const maxCost = Math.max(...dailyData.map((x) => x.cost), 1);
                  const pct = (d.cost / maxCost) * 100;
                  return (
                    <div key={d.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", fontSize: 10 }}>
                      <div style={{ marginBottom: 2 }}>¥{d.cost.toFixed(1)}</div>
                      <div style={{ width: "100%", height: `${Math.max(pct, 2)}%`, background: "var(--color-primary)", borderRadius: 2, minHeight: 2 }} />
                      <div style={{ marginTop: 2, color: "var(--color-text-secondary)" }}>{d.day.slice(-2)}日</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Monthly History */}
        <div className="panel mt-16">
          <div className="panel-header">
            <span>📅 历史账单</span>
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            {history.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-secondary)" }}>暂无历史账单</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>月份</th>
                    <th>消费金额</th>
                    <th>笔数</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((m) => (
                    <>
                      <tr key={m.month} style={{ cursor: "pointer" }} onClick={() => loadMonthDetail(m.month)}>
                        <td>{m.month}</td>
                        <td>¥{m.total_cost.toFixed(2)}</td>
                        <td>{m.bill_count}</td>
                        <td>
                          <button className="btn btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); handleExport(m.month); }}>
                            📥 下载CSV
                          </button>
                        </td>
                      </tr>
                      {selectedMonth === m.month && monthDetail && (
                        <tr>
                          <td colSpan={4} style={{ background: "#f9fafb", padding: 16 }}>
                            <div style={{ fontWeight: 600, marginBottom: 12 }}>
                              {monthDetail.month} 月详情 — 总消费 ¥{monthDetail.summary.total_cost.toFixed(2)} | 退款 ¥{monthDetail.summary.total_refund.toFixed(2)} | 调用 {monthDetail.summary.total_calls} 次
                            </div>
                            {monthDetail.model_items.length > 0 && (
                              <div style={{ marginBottom: 12 }}>
                                <div className="text-sm text-muted" style={{ marginBottom: 4 }}>按模型：</div>
                                {monthDetail.model_items.map((mi) => (
                                  <span key={mi.model} className="badge badge-info" style={{ marginRight: 8 }}>
                                    {mi.model}: {mi.calls}次 ¥{mi.cost.toFixed(2)}
                                  </span>
                                ))}
                              </div>
                            )}
                            {monthDetail.items.length > 0 && (
                              <div>
                                <div className="text-sm text-muted" style={{ marginBottom: 4 }}>按供应商：</div>
                                {monthDetail.items.map((item) => (
                                  <span key={item.price_source} className="badge badge-default" style={{ marginRight: 8 }}>
                                    {item.price_source}: {item.calls}次 ¥{item.cost.toFixed(2)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
