import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon } from "@3cloud/shared-ui";
import "./console-misc.css";

interface ConsumptionRecord { id: number; customer_name: string; model_name: string; tokens_in: number; tokens_out: number; total_tokens: number; amount: number; created_at: string; }

export default function AgentConsumptionPage() {
  const [records, setRecords] = useState<ConsumptionRecord[]>([]);
  const [stats, setStats] = useState({ today_tokens: 0, today_amount: 0, month_tokens: 0, month_amount: 0 });
  const [customerFilter, setCustomerFilter] = useState("");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });

  useEffect(() => {
    api.get("/agent/consumption", { params: { customer_name: customerFilter || undefined, date_start: dateRange.start || undefined, date_end: dateRange.end || undefined } })
      .then(r => {
        setRecords(r.data?.data?.list ?? []);
        setStats(r.data?.data?.stats ?? stats);
      }).catch(() => {});
  }, [customerFilter, dateRange]);

  return (
    <div>
      <div className="cm-pagehead">
        <div className="cm-pagehead__titles">
          <div className="cm-pagehead__title">客户消费追踪
            <HelpIcon text="追踪您名下所有客户的 API 消费明细。支持按客户和日期筛选。" level="page" />
          </div>
          <div className="cm-pagehead__sub">名下所有客户的 API 消费明细，支持按客户与日期筛选。</div>
        </div>
      </div>

      <div className="cm-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "今日 Token", value: stats.today_tokens.toLocaleString() },
          { label: "今日消费", value: `¥${(stats.today_amount / 100).toFixed(2)}` },
          { label: "本月 Token", value: stats.month_tokens.toLocaleString() },
          { label: "本月消费", value: `¥${(stats.month_amount / 100).toFixed(2)}` },
        ].map((s, i) => (
          <div key={i} style={{ background: "var(--color-panel)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", padding: "16px 20px", boxShadow: "var(--shadow-card)" }}>
            <div className="cm-kpi-label" style={{ marginBottom: 4 }}>{s.label}</div>
            <div className="cm-kpi-value" style={{ fontSize: 20 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <input placeholder="搜索客户名称" value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}
          style={{ padding: "6px 12px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", width: 200, fontSize: 13 }} />
        <input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})}
          style={{ padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", fontSize: 13 }} />
        <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>至</span>
        <input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})}
          style={{ padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", fontSize: 13 }} />
      </div>

      <div style={{ background: "var(--color-panel)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-lg)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
        <table className="cm-table">
          <thead><tr>
            <th>客户</th><th>模型</th><th className="num">输入 Token</th><th className="num">输出 Token</th><th className="num">总 Token</th><th className="num">金额</th><th>时间</th>
          </tr></thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id}>
                <td style={{ color: "var(--color-text)", fontWeight: 500 }}>{r.customer_name}</td>
                <td>{r.model_name}</td>
                <td className="num" style={{ fontFamily: "var(--font-family-mono)", fontSize: 12 }}>{r.tokens_in.toLocaleString()}</td>
                <td className="num" style={{ fontFamily: "var(--font-family-mono)", fontSize: 12 }}>{r.tokens_out.toLocaleString()}</td>
                <td className="num" style={{ fontFamily: "var(--font-family-mono)", fontWeight: 600 }}>{r.total_tokens.toLocaleString()}</td>
                <td className="num" style={{ fontWeight: 600 }}>¥{(r.amount / 100).toFixed(4)}</td>
                <td style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {records.length === 0 && <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>暂无消费记录</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
