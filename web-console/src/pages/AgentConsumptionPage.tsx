import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon } from "@3cloud/shared-ui";

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
      <div style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>📊</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>客户消费追踪
          <HelpIcon text="追踪您名下所有客户的 API 消费明细。支持按客户和日期筛选。" level="page" />
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "今日 Token", value: stats.today_tokens.toLocaleString(), color: "#4f6ef7" },
          { label: "今日消费", value: `¥${(stats.today_amount / 100).toFixed(2)}`, color: "#22c55e" },
          { label: "本月 Token", value: stats.month_tokens.toLocaleString(), color: "#8b5cf6" },
          { label: "本月消费", value: `¥${(stats.month_amount / 100).toFixed(2)}`, color: "#f59e0b" },
        ].map((s, i) => (
          <div key={i} style={{ background: "var(--color-panel)", borderRadius: 8, padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <input placeholder="搜索客户名称" value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}
          style={{ padding: "6px 12px", border: "1px solid var(--color-border)", borderRadius: 6, width: 200, fontSize: 13 }} />
        <input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})}
          style={{ padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 13 }} />
        <span style={{ fontSize: 13, color: "#888" }}>至</span>
        <input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})}
          style={{ padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 13 }} />
      </div>

      <div style={{ background: "var(--color-panel)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#fafafa" }}>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>客户</th>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>模型</th>
            <th style={{ padding: "10px 14px", textAlign: "right" }}>输入 Token</th>
            <th style={{ padding: "10px 14px", textAlign: "right" }}>输出 Token</th>
            <th style={{ padding: "10px 14px", textAlign: "right" }}>总 Token</th>
            <th style={{ padding: "10px 14px", textAlign: "right" }}>金额</th>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>时间</th>
          </tr></thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                <td style={{ padding: "8px 14px", color: "#4f6ef7", fontWeight: 500 }}>{r.customer_name}</td>
                <td style={{ padding: "8px 14px" }}>{r.model_name}</td>
                <td style={{ padding: "8px 14px", textAlign: "right", fontFamily: "monospace", fontSize: 12 }}>{r.tokens_in.toLocaleString()}</td>
                <td style={{ padding: "8px 14px", textAlign: "right", fontFamily: "monospace", fontSize: 12 }}>{r.tokens_out.toLocaleString()}</td>
                <td style={{ padding: "8px 14px", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{r.total_tokens.toLocaleString()}</td>
                <td style={{ padding: "8px 14px", textAlign: "right", fontWeight: 600, color: "#4f6ef7" }}>¥{(r.amount / 100).toFixed(4)}</td>
                <td style={{ padding: "8px 14px", fontSize: 12, color: "#888" }}>{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {records.length === 0 && <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无消费记录</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
