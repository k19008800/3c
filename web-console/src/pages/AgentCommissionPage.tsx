import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon } from "@3cloud/shared-ui";

interface CommissionRecord { id: number; customer_name: string; amount: number; rate: number; commission: number; status: string; settled_at: string | null; created_at: string; }

export default function AgentCommissionPage() {
  const [records, setRecords] = useState<CommissionRecord[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, settled: 0, this_month: 0 });
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.get("/agent/commission", { params: { page, status: filter || undefined } }).then(r => {
      setRecords(r.data?.data?.list ?? []);
      setStats(r.data?.data?.stats ?? stats);
    }).catch(() => {});
  }, [page, filter]);

  const fmt = (v: number) => `¥${(v / 100).toFixed(2)}`;

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>💰</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>佣金记录
          <HelpIcon text="查看您名下客户消费产生的佣金记录。佣金结算后自动转入可提现余额。" level="page" />
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "累计佣金", value: fmt(stats.total), color: "#4f6ef7" },
          { label: "待结算", value: fmt(stats.pending), color: "#f59e0b" },
          { label: "已结算", value: fmt(stats.settled), color: "#22c55e" },
          { label: "本月佣金", value: fmt(stats.this_month), color: "#8b5cf6" },
        ].map((s, i) => (
          <div key={i} style={{ background: "var(--color-panel)", borderRadius: 8, padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["", "pending", "settled"].map(s => (
          <button key={s} onClick={() => { setFilter(s); setPage(1); }} style={{ padding: "6px 16px", borderRadius: 6, border: filter === s ? "2px solid #4f6ef7" : "1px solid var(--color-border)", background: filter === s ? "#eef2ff" : "var(--color-panel)", color: filter === s ? "#4f6ef7" : "#666", cursor: "pointer", fontSize: 12 }}>
            {s === "" ? "全部" : s === "pending" ? "待结算" : "已结算"}
          </button>
        ))}
      </div>

      <div style={{ background: "var(--color-panel)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#fafafa" }}>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>客户</th>
            <th style={{ padding: "10px 14px", textAlign: "right" }}>消费金额</th>
            <th style={{ padding: "10px 14px", textAlign: "center" }}>佣金比例</th>
            <th style={{ padding: "10px 14px", textAlign: "right" }}>佣金</th>
            <th style={{ padding: "10px 14px", textAlign: "center" }}>状态</th>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>时间</th>
          </tr></thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                <td style={{ padding: "8px 14px" }}>{r.customer_name}</td>
                <td style={{ padding: "8px 14px", textAlign: "right", fontFamily: "monospace" }}>{fmt(r.amount)}</td>
                <td style={{ padding: "8px 14px", textAlign: "center" }}>{r.rate}%</td>
                <td style={{ padding: "8px 14px", textAlign: "right", fontWeight: 600, color: "#22c55e" }}>{fmt(r.commission)}</td>
                <td style={{ padding: "8px 14px", textAlign: "center" }}>
                  <span style={{ padding: "2px 10px", borderRadius: 10, fontSize: 11, background: r.status === "settled" ? "#f0fdf4" : "#fff7e6", color: r.status === "settled" ? "#22c55e" : "#f59e0b" }}>
                    {r.status === "settled" ? "已结算" : "待结算"}
                  </span>
                </td>
                <td style={{ padding: "8px 14px", fontSize: 12, color: "#888" }}>{new Date(r.settled_at ?? r.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {records.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无佣金记录</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
