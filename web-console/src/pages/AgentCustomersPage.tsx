import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon, StatusBadge } from "@3cloud/shared-ui";
import "./console-misc.css";

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
      <div className="cm-pagehead">
        <div className="cm-pagehead__titles">
          <div className="cm-pagehead__title">我的客户
            <HelpIcon text="查看您名下所有客户列表。显示客户余额、消费总额、为您带来的佣金及佣金比例。" level="page" />
          </div>
          <div className="cm-pagehead__sub">名下客户的余额、累计消费、佣金贡献与佣金比例。</div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input placeholder="搜索客户名称或邮箱..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: "8px 14px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", width: 300, maxWidth: "100%", fontSize: 13 }} />
      </div>

      <div style={{ background: "var(--color-panel)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-lg)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
        <table className="cm-table">
          <thead><tr>
            <th>用户名</th><th>邮箱</th><th className="num">余额</th><th className="num">累计消费</th><th className="num">累计佣金</th><th style={{textAlign:"center"}}>佣金比例</th><th style={{textAlign:"center"}}>状态</th><th>加入时间</th>
          </tr></thead>
          <tbody>
            {customers.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.username}</td>
                <td style={{ color: "var(--color-text-muted)" }}>{c.email}</td>
                <td className="num" style={{ fontFamily: "var(--font-family-mono)" }}>¥{(c.balance / 100).toFixed(2)}</td>
                <td className="num" style={{ fontFamily: "var(--font-family-mono)" }}>¥{(c.total_consumed / 100).toFixed(2)}</td>
                <td className="num" style={{ fontWeight: 600, color: "var(--color-success-text)" }}>¥{(c.total_commission / 100).toFixed(2)}</td>
                <td style={{ textAlign: "center" }}>{c.commission_rate}%</td>
                <td style={{ textAlign: "center" }}>
                  <StatusBadge status={c.status === "active" ? "success" : "danger"}>{c.status === "active" ? "活跃" : "已禁用"}</StatusBadge>
                </td>
                <td style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{new Date(c.joined_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {customers.length === 0 && <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>暂无客户</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
