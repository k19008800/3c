import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon, StatusBadge } from "@3cloud/shared-ui";

interface TopupRecord { id: number; order_no: string; amount: number; payment_method: string; status: string; status_label: string; created_at: string; }

export default function TopupRecordsPage() {
  const [records, setRecords] = useState<TopupRecord[]>([]);
  const [stats, setStats] = useState({ total_amount: 0, count: 0 });
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.get("/me/recharge/records", { params: { page } }).then(r => {
      setRecords(r.data?.data?.list ?? []);
      setStats(r.data?.data?.stats ?? stats);
    }).catch(() => {});
  }, [page]);

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#4f6ef7,#6366f1)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>📋</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>充值记录
          <HelpIcon text="查看您的充值历史记录，包括在线支付和人工上账。" level="page" />
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginBottom: 20 }}>
        <div style={{ background: "var(--color-panel)", borderRadius: 8, padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>累计充值</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#22c55e" }}>¥{(stats.total_amount / 100).toFixed(2)}</div>
        </div>
        <div style={{ background: "var(--color-panel)", borderRadius: 8, padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>充值次数</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#4f6ef7" }}>{stats.count}</div>
        </div>
      </div>

      <div style={{ background: "var(--color-panel)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#fafafa" }}>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>订单号</th>
            <th style={{ padding: "10px 14px", textAlign: "right" }}>金额</th>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>支付方式</th>
            <th style={{ padding: "10px 14px", textAlign: "center" }}>状态</th>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>时间</th>
          </tr></thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                <td style={{ padding: "8px 14px", fontFamily: "monospace", fontSize: 12 }}>{r.order_no}</td>
                <td style={{ padding: "8px 14px", textAlign: "right", fontWeight: 600 }}>¥{(r.amount / 100).toFixed(2)}</td>
                <td style={{ padding: "8px 14px" }}>{r.payment_method}</td>
                <td style={{ padding: "8px 14px", textAlign: "center" }}>
                  <StatusBadge label={r.status_label ?? r.status}
                    variant={r.status === "success" ? "success" : r.status === "pending" ? "warning" : "danger"} />
                </td>
                <td style={{ padding: "8px 14px", fontSize: 12, color: "#888" }}>{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {records.length === 0 && <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无充值记录</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
