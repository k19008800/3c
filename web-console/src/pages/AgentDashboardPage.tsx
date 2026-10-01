import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { HelpIcon } from "@3cloud/shared-ui";
import "./console-misc.css";

interface AgentDashboardData {
  total_commission: number; month_commission: number; total_customers: number; active_customers: number;
  month_consumption: number; total_consumption: number; ranking: number; total_agents: number;
}
interface ConsumptionItem { id: number; customer_name: string; model_name: string; tokens: number; amount: number; created_at: string; }

const card: React.CSSProperties = {
  background: "var(--color-panel)",
  border: "1px solid var(--color-divider)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-lg) var(--space-xl)",
  boxShadow: "var(--shadow-card)",
  cursor: "pointer",
  transition: "border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out)",
};

export default function AgentDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<AgentDashboardData>({ total_commission: 0, month_commission: 0, total_customers: 0, active_customers: 0, month_consumption: 0, total_consumption: 0, ranking: 0, total_agents: 0 });
  const [recent, setRecent] = useState<ConsumptionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/agent/dashboard").then(r => setData(r.data?.data ?? data)),
      api.get("/agent/consumption/recent").then(r => setRecent(r.data?.data?.list ?? [])),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const quickLinks = [
    { label: "佣金中心", to: "/agent/commission" },
    { label: "客户列表", to: "/agent/customers" },
    { label: "消费追踪", to: "/agent/consumption" },
    { label: "邀请管理", to: "/agent/invite" },
    { label: "排行榜", to: "/agent/ranking" },
    { label: "提现管理", to: "/agent/withdraw" },
  ];

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>加载中…</div>;

  return (
    <div>
      <div className="cm-pagehead">
        <div className="cm-pagehead__titles">
          <div className="cm-pagehead__title">代理商控制台
            <HelpIcon text="总览您名下客户的消费情况和您的佣金收入。点击卡片可跳转对应详情。" level="page" />
          </div>
          <div className="cm-pagehead__sub">总览名下客户消费与佣金收入，点击卡片可跳转对应详情。</div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="cm-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        <div style={card} onClick={() => navigate("/agent/commission")}>
          <div className="cm-kpi-label">累计佣金</div>
          <div className="cm-kpi-value" style={{ fontSize: 22 }}>¥{(data.total_commission / 100).toFixed(2)}</div>
          <div style={{ fontSize: 11, color: "var(--color-success-text)", marginTop: 4 }}>本月 +¥{(data.month_commission / 100).toFixed(2)}</div>
        </div>
        <div style={card} onClick={() => navigate("/agent/customers")}>
          <div className="cm-kpi-label">名下客户</div>
          <div className="cm-kpi-value" style={{ fontSize: 22 }}>{data.total_customers}</div>
          <div style={{ fontSize: 11, color: "var(--color-success-text)", marginTop: 4 }}>活跃 {data.active_customers} 人</div>
        </div>
        <div style={card} onClick={() => navigate("/agent/consumption")}>
          <div className="cm-kpi-label">累计消费</div>
          <div className="cm-kpi-value" style={{ fontSize: 22 }}>¥{(data.total_consumption / 100).toFixed(2)}</div>
          <div style={{ fontSize: 11, color: "var(--color-success-text)", marginTop: 4 }}>本月 ¥{(data.month_consumption / 100).toFixed(2)}</div>
        </div>
        <div style={card} onClick={() => navigate("/agent/ranking")}>
          <div className="cm-kpi-label">业绩排行</div>
          <div className="cm-kpi-value" style={{ fontSize: 22 }}># {data.ranking}</div>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4 }}>共 {data.total_agents} 代理商</div>
        </div>
      </div>

      {/* Quick Entry */}
      <div className="cm-grid-6" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 20 }}>
        {quickLinks.map(l => (
          <div key={l.to} className="cm-quick" onClick={() => navigate(l.to)}>
            <div className="cm-quick__label">{l.label}</div>
          </div>
        ))}
      </div>

      {/* Recent Consumption */}
      <div style={{ background: "var(--color-panel)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-lg)", padding: 20, boxShadow: "var(--shadow-card)" }}>
        <h4 style={{ margin: "0 0 12px", fontSize: 15, color: "var(--color-text)" }}>最近消费动态 <HelpIcon text="您名下客户的最新 API 消费记录。" /></h4>
        <table className="cm-table">
          <thead>
            <tr>
              <th>客户</th>
              <th>模型</th>
              <th className="num">Token</th>
              <th className="num">金额</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {recent.map(r => (
              <tr key={r.id} style={{ cursor: "pointer" }}>
                <td style={{ color: "var(--color-primary)", fontWeight: 500 }}>{r.customer_name}</td>
                <td style={{ color: "var(--color-text-secondary)" }}>{r.model_name}</td>
                <td className="num" style={{ fontFamily: "var(--font-family-mono)" }}>{r.tokens.toLocaleString()}</td>
                <td className="num" style={{ fontWeight: 600 }}>¥{(r.amount / 100).toFixed(4)}</td>
                <td style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {recent.length === 0 && <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>暂无消费记录</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
