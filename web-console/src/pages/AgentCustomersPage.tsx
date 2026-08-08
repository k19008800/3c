import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon, StatusBadge } from "@3cloud/shared-ui";

interface Customer { id: number; username: string; email: string; balance: number; total_consumed: number; total_commission: number; commission_rate: number; status: string; joined_at: string; }

export default function AgentCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.get("/agent/customers", { params: { search: search || undefined } })
      .then(r => setCustomers(r.data?.data?.list ?? [])).catch(() => {});
  }, [search]);

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>👥</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>我的客户
          <HelpIcon text="查看您名下所有客户列表。显示客户余额、消费总额、为您带来的佣金及佣金比例。" level="page" />
        </span>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input placeholder="搜索客户名称或邮箱..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: "8px 14px", border: "1px solid var(--color-border)", borderRadius: 8, width: 300, fontSize: 13 }} />
      </div>

      <div style={{ background: "var(--color-panel)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#fafafa" }}>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>用户名</th>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>邮箱</th>
            <th style={{ padding: "10px 14px", textAlign: "right" }}>余额</th>
            <th style={{ padding: "10px 14px", textAlign: "right" }}>累计消费</th>
            <th style={{ padding: "10px 14px", textAlign: "right" }}>累计佣金</th>
            <th style={{ padding: "10px 14px", textAlign: "center" }}>佣金比例</th>
            <th style={{ padding: "10px 14px", textAlign: "center" }}>状态</th>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>加入时间</th>
          </tr></thead>
          <tbody>
            {customers.map(c => (
              <tr key={c.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                <td style={{ padding: "8px 14px", fontWeight: 600 }}>{c.username}</td>
                <td style={{ padding: "8px 14px", color: "#888" }}>{c.email}</td>
                <td style={{ padding: "8px 14px", textAlign: "right", fontFamily: "monospace" }}>¥{(c.balance / 100).toFixed(2)}</td>
                <td style={{ padding: "8px 14px", textAlign: "right", fontFamily: "monospace" }}>¥{(c.total_consumed / 100).toFixed(2)}</td>
                <td style={{ padding: "8px 14px", textAlign: "right", fontWeight: 600, color: "#22c55e" }}>¥{(c.total_commission / 100).toFixed(2)}</td>
                <td style={{ padding: "8px 14px", textAlign: "center" }}>{c.commission_rate}%</td>
                <td style={{ padding: "8px 14px", textAlign: "center" }}>
                  <StatusBadge label={c.status === "active" ? "活跃" : "已禁用"} variant={c.status === "active" ? "success" : "danger"} />
                </td>
                <td style={{ padding: "8px 14px", fontSize: 12, color: "#888" }}>{new Date(c.joined_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {customers.length === 0 && <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无客户</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
