import { useEffect, useState } from "react";
import AgentLayout from "../../components/AgentLayout";
import HelpModal from "../../components/HelpModal";
import { agentApi, type WithdrawSummary, type AgentReport } from "../../services/agent";

// ── Types ──
interface DashboardData {
  customerCount: number;
  monthlyCommission: number;
  monthlyConsumption: number;
  pendingWithdraw: number;
}

interface CustomerBrief {
  id: string;
  name: string;
  email: string;
  registerDate: string;
  consumption: number;
}

interface CommissionMonthly {
  month: string;
  amount: number;
}

// ── Fallback mock for chart (no monthly-aggregation endpoint yet) ──
const COMMISSION_CHART: CommissionMonthly[] = [
  { month: "1月", amount: 3200 },
  { month: "2月", amount: 4500 },
  { month: "3月", amount: 3800 },
  { month: "4月", amount: 6200 },
  { month: "5月", amount: 7100 },
  { month: "6月", amount: 8500 },
  { month: "7月", amount: 10200 },
  { month: "8月", amount: 12450 },
];

const MAX_COMMISSION = Math.max(...COMMISSION_CHART.map((c) => c.amount));

// ── Helpers ──
function formatDate(iso: string | undefined): string {
  if (!iso) return "-";
  return iso.slice(0, 10);
}

function safeNum(v: unknown): number {
  return Number(v ?? 0);
}

// ── Component ──
export default function AgentDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardData>({
    customerCount: 0,
    monthlyCommission: 0,
    monthlyConsumption: 0,
    pendingWithdraw: 0,
  });
  const [recentCustomers, setRecentCustomers] = useState<CustomerBrief[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchDashboard() {
      setLoading(true);
      setError(null);

      const [summaryRes, reportsRes] = await Promise.all([
        agentApi.getWithdrawSummary(),
        agentApi.getReports(),
      ]);

      if (cancelled) return;

      const summaryErr = summaryRes.error;
      const reportsErr = reportsRes.error;

      if (summaryErr && reportsErr) {
        setError(summaryErr);
        setLoading(false);
        return;
      }

      const summary: WithdrawSummary | null = summaryRes.data;
      const reports: AgentReport[] = reportsRes.data?.list ?? [];

      // Build stats from API data (distinct endpoints for each stat)
      setStats({
        customerCount: reports.length,
        monthlyCommission: safeNum(summary?.commission_total),
        // monthlyConsumption: no separate endpoint yet — keep at 0 with note
        monthlyConsumption: 0,
        pendingWithdraw: safeNum(summary?.withdrawable),
      });

      // Map report records to customer briefs (recent 5)
      setRecentCustomers(
        reports
          .sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime(),
          )
          .slice(0, 5)
          .map((r) => ({
            id: String(r.id),
            name: r.target_username || r.target_email_resolved || r.target_email || `报备 #${r.id}`,
            email: r.target_email_resolved || r.target_email || "-",
            registerDate: formatDate(r.created_at),
            consumption: 0, // no consumption per-customer in this endpoint
          })),
      );

      setLoading(false);
    }

    fetchDashboard();
    return () => { cancelled = true; };
  }, []);

  return (
    <AgentLayout>
      <h1 className="page-title">
        🏠 代理商工作台
        <HelpModal title="代理商工作台">
          <p>代理商工作台为您提供业务概览。包含客户数量、佣金收入、消费统计等核心指标。</p>
          <p style={{ marginTop: 8 }}>下方展示近期客户和月度佣金趋势，帮助您快速了解业务动态。</p>
        </HelpModal>
      </h1>
      <p className="page-subtitle">欢迎回来！以下是您的业务概览</p>

      {/* Loading / Error */}
      {loading && (
        <div className="panel" style={{ textAlign: "center", padding: 32 }}>
          ⏳ 加载中...
        </div>
      )}

      {error && (
        <div className="panel" style={{ textAlign: "center", padding: 32, color: "var(--color-danger-text)" }}>
          ❌ {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Stats Cards */}
          <div className="stats-grid">
            <div className="stat-card" style={{ cursor: "default" }}>
              <div className="stat-card-label">客户总数</div>
              <div className="stat-card-value">{stats.customerCount}</div>
              <div className="stat-card-action">👥 已报备客户</div>
            </div>
            <div className="stat-card" style={{ cursor: "default" }}>
              <div className="stat-card-label">累计佣金（元）</div>
              <div className="stat-card-value">
                ¥{stats.monthlyCommission.toLocaleString()}
              </div>
              <div className="stat-card-action">📈 累计总额</div>
            </div>
            <div className="stat-card" style={{ cursor: "default" }}>
              <div className="stat-card-label">月消费额（元）</div>
              <div className="stat-card-value">
                ¥{stats.monthlyConsumption.toLocaleString()}
              </div>
              <div className="stat-card-action">
                💡 TODO: 待后端月消费接口
              </div>
            </div>
            <div className="stat-card" style={{ cursor: "default" }}>
              <div className="stat-card-label">可提现金额（元）</div>
              <div className="stat-card-value">
                ¥{stats.pendingWithdraw.toLocaleString()}
              </div>
              <div className="stat-card-action">🏦 可提现</div>
            </div>
          </div>

          {/* Two-column layout */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Recent Customers */}
            <div className="panel">
              <div className="panel-header">👥 近期客户</div>
              <div className="panel-body" style={{ padding: 0 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>客户名称</th>
                      <th>报备时间</th>
                      <th>消费额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="text-center" style={{ padding: 40, color: "var(--color-text-secondary)" }}>
                          暂无客户
                        </td>
                      </tr>
                    ) : (
                      recentCustomers.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <div style={{ fontWeight: 500 }}>{c.name}</div>
                            <div className="text-sm text-muted">{c.email}</div>
                          </td>
                          <td>{c.registerDate}</td>
                          <td className="text-mono">
                            ¥{c.consumption.toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Commission Chart (mock — no monthly-aggregation endpoint yet) */}
            <div className="panel">
              <div className="panel-header">📈 佣金概览</div>
              <div className="panel-body">
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 8 }}>
                  ⚠️ 图表为示例数据 — 月度聚合接口待开发
                </div>
                <div className="chart-container">
                  <svg viewBox="0 0 400 220" width="100%" height="220">
                    {/* Y axis labels */}
                    <line x1="50" y1="20" x2="50" y2="200" stroke="#d9d9d9" strokeWidth="1" />
                    <line x1="50" y1="200" x2="380" y2="200" stroke="#d9d9d9" strokeWidth="1" />
                    {/* Y axis ticks */}
                    {[0, 25, 50, 75, 100].map((pct) => {
                      const y = 200 - (pct / 100) * 160;
                      const val = (MAX_COMMISSION * pct) / 100;
                      return (
                        <g key={pct}>
                          <line x1="45" y1={y} x2="50" y2={y} stroke="#d9d9d9" strokeWidth="1" />
                          <text x="42" y={y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">
                            ¥{val.toFixed(0)}
                          </text>
                        </g>
                      );
                    })}
                    {/* Bars */}
                    {COMMISSION_CHART.map((c, i) => {
                      const barW = 30;
                      const gap = 12;
                      const x = 60 + i * (barW + gap);
                      const h = (c.amount / MAX_COMMISSION) * 160;
                      const y = 200 - h;
                      return (
                        <g key={c.month}>
                          <rect
                            x={x}
                            y={y}
                            width={barW}
                            height={h}
                            fill={i === COMMISSION_CHART.length - 1 ? "#4f6ef7" : "#c9cdd4"}
                            rx="3"
                          />
                          <text x={x + barW / 2} y={215} textAnchor="middle" fontSize="10" fill="#6b7280">
                            {c.month}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </AgentLayout>
  );
}
