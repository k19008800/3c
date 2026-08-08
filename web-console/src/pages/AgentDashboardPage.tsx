import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { HelpIcon } from "@3cloud/shared-ui";

interface AgentDashboardData {
  total_commission: number; month_commission: number; total_customers: number; active_customers: number;
  month_consumption: number; total_consumption: number; ranking: number; total_agents: number;
}
interface ConsumptionItem { id: number; customer_name: string; model_name: string; tokens: number; amount: number; created_at: string; }

const card: React.CSSProperties = { background: "var(--color-panel)", borderRadius: 8, padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,.06)", cursor: "pointer", transition: "transform .2s, box-shadow .2s" };

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
    { label: "佣金中心", icon: "💰", to: "/agent/commission" },
    { label: "客户列表", icon: "👥", to: "/agent/customers" },
    { label: "消费追踪", icon: "📊", to: "/agent/consumption" },
    { label: "邀请管理", icon: "🔗", to: "/agent/invite" },
    { label: "排行榜", icon: "🏆", to: "/agent/ranking" },
    { label: "提现管理", icon: "💳", to: "/agent/withdraw" },
  ];

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#888" }}>加载中…</div>;

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>📈</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>代理商控制台
          <HelpIcon text="总览您名下客户的消费情况和您的佣金收入。点击卡片可跳转对应详情。" level="page" />
        </span>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        <div style={card} onClick={() => navigate("/agent/commission")}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>💰 累计佣金</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>¥{(data.total_commission / 100).toFixed(2)}</div>
          <div style={{ fontSize: 11, color: "#22c55e", marginTop: 4 }}>本月 +¥{(data.month_commission / 100).toFixed(2)}</div>
        </div>
        <div style={card} onClick={() => navigate("/agent/customers")}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>👥 名下客户</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{data.total_customers}</div>
          <div style={{ fontSize: 11, color: "#22c55e", marginTop: 4 }}>活跃 {data.active_customers} 人</div>
        </div>
        <div style={card} onClick={() => navigate("/agent/consumption")}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>📊 累计消费</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>¥{(data.total_consumption / 100).toFixed(2)}</div>
          <div style={{ fontSize: 11, color: "#22c55e", marginTop: 4 }}>本月 ¥{(data.month_consumption / 100).toFixed(2)}</div>
        </div>
        <div style={card} onClick={() => navigate("/agent/ranking")}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>🏆 业绩排行</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}># {data.ranking}</div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>共 {data.total_agents} 代理商</div>
        </div>
      </div>

      {/* Quick Entry */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 20 }}>
        {quickLinks.map(l => (
          <div key={l.to} onClick={() => navigate(l.to)} style={{ background: "var(--color-panel)", borderRadius: 8, padding: "20px 12px", textAlign: "center", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,.06)", transition: "transform .2s" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{l.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#555" }}>{l.label}</div>
          </div>
        ))}
      </div>

      {/* Recent Consumption */}
      <div style={{ background: "var(--color-panel)", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
        <h4 style={{ margin: "0 0 12px" }}>📋 最近消费动态 <HelpIcon text="您名下客户的最新 API 消费记录。" /></h4>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              <th style={{ padding: "10px 14px", textAlign: "left" }}>客户</th>
              <th style={{ padding: "10px 14px", textAlign: "left" }}>模型</th>
              <th style={{ padding: "10px 14px", textAlign: "right" }}>Token</th>
              <th style={{ padding: "10px 14px", textAlign: "right" }}>金额</th>
              <th style={{ padding: "10px 14px", textAlign: "left" }}>时间</th>
            </tr>
          </thead>
          <tbody>
            {recent.map(r => (
              <tr key={r.id} style={{ borderBottom: "1px solid #f5f5f5", cursor: "pointer" }}>
                <td style={{ padding: "8px 14px", color: "#4f6ef7" }}>{r.customer_name}</td>
                <td style={{ padding: "8px 14px", color: "#666" }}>{r.model_name}</td>
                <td style={{ padding: "8px 14px", textAlign: "right", fontFamily: "monospace" }}>{r.tokens.toLocaleString()}</td>
                <td style={{ padding: "8px 14px", textAlign: "right", fontWeight: 600 }}>¥{(r.amount / 100).toFixed(4)}</td>
                <td style={{ padding: "8px 14px", fontSize: 12, color: "#888" }}>{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {recent.length === 0 && <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无消费记录</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
