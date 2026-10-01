import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon } from "@3cloud/shared-ui";
import "./console-misc.css";

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
      <div className="cm-pagehead">
        <div className="cm-pagehead__titles">
          <div className="cm-pagehead__title">佣金记录
            <HelpIcon text="查看您名下客户消费产生的佣金记录。佣金结算后自动转入可提现余额。" level="page" />
          </div>
          <div className="cm-pagehead__sub">名下客户消费产生的佣金明细，结算后自动转入可提现余额。</div>
        </div>
      </div>

      <div className="cm-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "累计佣金", value: fmt(stats.total) },
          { label: "待结算", value: fmt(stats.pending) },
          { label: "已结算", value: fmt(stats.settled) },
          { label: "本月佣金", value: fmt(stats.this_month) },
        ].map((s, i) => (
          <div key={i} style={{ background: "var(--color-panel)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", padding: "16px 20px", boxShadow: "var(--shadow-card)" }}>
            <div className="cm-kpi-label" style={{ marginBottom: 4 }}>{s.label}</div>
            <div className="cm-kpi-value" style={{ fontSize: 20 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["", "pending", "settled"].map(s => (
          <button key={s} onClick={() => { setFilter(s); setPage(1); }} style={{
            padding: "6px 16px", borderRadius: "var(--radius-sm)",
            border: filter === s ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
            background: filter === s ? "var(--color-primary-light)" : "var(--color-panel)",
            color: filter === s ? "var(--color-primary)" : "var(--color-text-secondary)",
            cursor: "pointer", fontSize: 12, fontWeight: filter === s ? 600 : 400,
          }}>
            {s === "" ? "全部" : s === "pending" ? "待结算" : "已结算"}
          </button>
        ))}
      </div>

      <div style={{ background: "var(--color-panel)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-lg)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
        <table className="cm-table">
          <thead><tr>
            <th>客户</th><th className="num">消费金额</th><th>佣金比例</th><th className="num">佣金</th><th style={{textAlign:"center"}}>状态</th><th>时间</th>
          </tr></thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id}>
                <td>{r.customer_name}</td>
                <td className="num" style={{ fontFamily: "var(--font-family-mono)" }}>{fmt(r.amount)}</td>
                <td style={{ textAlign: "center" }}>{r.rate}%</td>
                <td className="num" style={{ fontWeight: 600, color: "var(--color-success-text)" }}>{fmt(r.commission)}</td>
                <td style={{ textAlign: "center" }}>
                  <span style={{
                    padding: "2px 10px", borderRadius: "var(--radius-pill)", fontSize: 11,
                    background: r.status === "settled" ? "var(--color-success-bg)" : "var(--color-warning-bg)",
                    color: r.status === "settled" ? "var(--color-success-text)" : "var(--color-warning-text)",
                  }}>
                    {r.status === "settled" ? "已结算" : "待结算"}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{new Date(r.settled_at ?? r.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {records.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>暂无佣金记录</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
